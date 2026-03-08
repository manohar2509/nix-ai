"""
NIX AI — Bedrock Service

Wraps Amazon Bedrock for:
  1. RAG chat via Knowledge Base (RetrieveAndGenerate)
  2. Direct model invocation via Converse API (supports all models incl. Nova)
  3. Streaming model invocation via ConverseStream API
  4. Native document understanding via Converse API DocumentBlock
  5. Structured data extraction via Amazon Textract
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Generator, Optional

from app.core.aws_clients import get_bedrock_agent_client, get_bedrock_runtime_client
from app.core.config import get_settings
from app.core.exceptions import BedrockError
from app.core.resilience import (
    BEDROCK_RETRY_CONFIG,
    CACHE_TTL_ANALYSIS,
    CACHE_TTL_CHAT,
    CACHE_TTL_RAG,
    CACHE_TTL_STRATEGIC,
    bedrock_agent_circuit,
    bedrock_circuit,
    bedrock_rate_limiter,
    llm_cache,
    resilient_bedrock_call,
    CircuitBreakerError,
)

logger = logging.getLogger(__name__)


def _extract_json_object(text: str) -> str | None:
    """Extract the first complete top-level JSON object from *text*.

    Uses brace-counting instead of a greedy regex so we don't accidentally
    swallow text after the closing `}`.
    """
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None

# Supported document formats for Bedrock Converse API DocumentBlock
DOCUMENT_FORMATS = {
    ".pdf": "pdf",
    ".csv": "csv",
    ".doc": "doc",
    ".docx": "docx",
    ".xls": "xls",
    ".xlsx": "xlsx",
    ".html": "html",
    ".htm": "html",
    ".txt": "txt",
    ".md": "md",
}

# Max document size for Converse API DocumentBlock (4.5 MB)
MAX_DOCUMENT_BYTES = 4_500_000


# ════════════════════════════════════════════════════════════════
# 1.  RAG Chat — Knowledge Base Retrieve & Generate
# ════════════════════════════════════════════════════════════════
def rag_chat(
    query: str,
    user_name: str = "User",
    user_org: str = "Independent",
    session_id: Optional[str] = None,
) -> dict:
    """
    Send a query to Bedrock Knowledge Base (RetrieveAndGenerate).

    Returns:
        {
            "text": "AI response ...",
            "citations": [{ "text": ..., "source": ..., "section": ... }],
            "session_id": "...",
        }
    """
    settings = get_settings()

    if not settings.BEDROCK_KB_ID:
        logger.warning("BEDROCK_KB_ID not configured — KB is required for grounded responses")
        return {
            "text": (
                "I cannot answer this question without access to the regulatory knowledge base. "
                "The knowledge base is not currently configured. Please contact your administrator "
                "to enable KB-grounded responses, or upload reference documents to the Knowledge Base panel."
            ),
            "citations": [],
            "session_id": None,
            "is_refusal": True,
            "error": "KB_NOT_CONFIGURED",
        }

    client = get_bedrock_agent_client()

    # Build the RAG request
    request_params = {
        "input": {"text": query},
        "retrieveAndGenerateConfiguration": {
            "type": "KNOWLEDGE_BASE",
            "knowledgeBaseConfiguration": {
                "knowledgeBaseId": settings.BEDROCK_KB_ID,
                "modelArn": settings.bedrock_kb_model_arn,
                "generationConfiguration": {
                    "promptTemplate": {
                        "textPromptTemplate": (
                            f"You are NIX AI, an expert clinical trial protocol analyst. "
                            f"The user is {user_name} from {user_org}. "
                            f"Answer their question using ONLY the retrieved documents. "
                            f"Cite specific sections and guideline codes (e.g., ICH E6(R3) Section 5.2.1). "
                            f"When referencing regulatory requirements, always name the specific guideline "
                            f"(ICH, FDA, EMA) and section. When referencing HTA requirements, name the body "
                            f"(NICE, IQWiG, CADTH, PBAC). If unsure, say so.\n\n"
                            f"IMPORTANT: You are ONLY authorized to answer questions related to clinical trials, "
                            f"regulatory compliance, protocol design, drug development, payer/HTA strategy, "
                            f"and biomedical/pharmaceutical topics. If the user asks a question that is "
                            f"clearly unrelated to clinical trials or healthcare (e.g., cooking, sports, "
                            f"entertainment, politics, general knowledge), politely decline and redirect "
                            f"them to ask about their clinical trial protocol instead.\n\n"
                            f"Question: $query$\n\n"
                            f"Retrieved context: $search_results$"
                        ),
                    }
                },
            },
        },
    }

    if session_id:
        request_params["sessionId"] = session_id

    # ── Check LLM cache for identical queries ──
    cache_key = f"rag|{query}|{user_name}|{user_org}"
    cached = llm_cache.get(cache_key, model_id="rag", extra="rag_chat")
    if cached:
        try:
            cached_result = json.loads(cached)
            logger.info("RAG cache HIT for query: %s", query[:60])
            return cached_result
        except (json.JSONDecodeError, TypeError):
            pass  # Cache corrupted, proceed with fresh call

    def _do_rag_call():
        return client.retrieve_and_generate(**request_params)

    try:
        # Use circuit breaker + rate limiter for the RAG call
        if not bedrock_rate_limiter.acquire(timeout=15.0):
            logger.warning("Rate limiter timeout for RAG call")
            raise BedrockError("Service temporarily busy. Please try again in a few seconds.")

        response = bedrock_agent_circuit.call(_do_rag_call)

        text = response.get("output", {}).get("text", "")
        citations = _extract_citations(response)
        new_session_id = response.get("sessionId", session_id)

        # Detect guardrail / empty-KB refusal responses from the model
        if _is_rag_refusal(text):
            logger.warning(
                "Bedrock RAG returned a refusal/empty response — "
                "KB may have no indexed documents. Response: %s",
                text[:200],
            )
            return {
                "text": text,
                "citations": citations,
                "session_id": new_session_id,
                "is_refusal": True,
            }

        logger.info(
            "Bedrock RAG success: %d chars, %d citations",
            len(text), len(citations),
        )
        result = {
            "text": text,
            "citations": citations,
            "session_id": new_session_id,
            "is_refusal": False,
            "grounding_source": "document_library",  # From the team's uploaded Document Library
            "kb_grounded": True,
        }

        # Cache the successful result
        try:
            llm_cache.put(cache_key, json.dumps(result, default=str),
                         model_id="rag", ttl=CACHE_TTL_RAG, extra="rag_chat")
        except Exception:
            pass  # Cache write failure is non-critical

        return result

    except CircuitBreakerError as cbe:
        logger.error("Bedrock RAG circuit breaker OPEN: %s", cbe)
        raise BedrockError(
            "AI service is temporarily unavailable due to high error rate. "
            f"Automatic recovery in {cbe.reset_time:.0f}s. Please try again shortly."
        )
    except BedrockError:
        raise
    except Exception as exc:
        logger.error("Bedrock RAG failed: %s", exc)
        raise BedrockError(str(exc))


# ── RAG refusal detection ────────────────────────────────────────
_REFUSAL_PHRASES = [
    "sorry, i am unable to assist",
    "sorry, i'm unable to assist",
    "i cannot assist you with this request",
    "i'm not able to help with that",
    "i don't have enough information",
    "no relevant information",
    "i could not find any relevant",
]


def _is_rag_refusal(text: str) -> bool:
    """Detect if the RAG response is a guardrail refusal or empty answer."""
    if not text or len(text.strip()) < 10:
        return True
    lower = text.strip().lower()
    return any(phrase in lower for phrase in _REFUSAL_PHRASES)


def direct_chat(
    query: str,
    document_text: str,
    user_name: str = "User",
    user_org: str = "Independent",
) -> dict:
    """
    Fallback chat using the Converse API directly with document text
    as context. Used when the Knowledge Base RAG returns a refusal
    (e.g. KB has no indexed documents).

    ⚠️ WARNING: This is NOT grounded on the Knowledge Base. Responses
    are based on the model's training data and may not reflect the latest
    regulatory guidelines. Citations are inferred from guideline mentions
    in the AI response and point to public URLs, not KB documents.

    Generates inline citations from guideline references in the response.
    """
    from app.services.regulatory_engine import ICH_GUIDELINES, FDA_GUIDANCE, HTA_BODY_REFS

    # Truncate document text to fit in context window
    max_doc_chars = 12_000
    doc_excerpt = document_text[:max_doc_chars] if document_text else ""

    if not doc_excerpt:
        # No document text available — answer generally
        prompt = (
            f"You are NIX AI, an expert clinical trial protocol analyst. "
            f"The user is {user_name} from {user_org}. "
            f"No document is currently loaded. Answer the user's question "
            f"helpfully based on your clinical trial expertise. "
            f"When referencing guidelines, always include the specific guideline code "
            f"(e.g., 'ICH E6(R3) Section 5.2.1', 'FDA Adaptive Designs Guidance'). "
            f"If you need a document to give a specific answer, ask the user to upload one.\n\n"
            f"IMPORTANT: You are ONLY authorized to answer questions related to clinical trials, "
            f"regulatory compliance, protocol design, drug development, payer/HTA strategy, "
            f"and biomedical/pharmaceutical topics. If the user asks a question that is "
            f"clearly unrelated to clinical trials or healthcare (e.g., cooking, sports, "
            f"entertainment, politics, general knowledge), politely decline and say: "
            f"'I'm NIX AI, specialized in clinical trial protocol analysis. "
            f"I can help with regulatory compliance, trial design, endpoint strategy, "
            f"payer readiness, and protocol optimization. Please ask me about your "
            f"clinical trial protocol.'\n\n"
            f"User question: {query}"
        )
    else:
        prompt = (
            f"You are NIX AI, an expert clinical trial protocol analyst. "
            f"The user is {user_name} from {user_org}. "
            f"Answer their question using the document context below. "
            f"Cite specific sections when possible. Be thorough but concise. "
            f"When referencing guidelines, always include the specific guideline code "
            f"(e.g., 'ICH E6(R3) Section 5.2.1', 'FDA Adaptive Designs Guidance'). \n\n"
            f"IMPORTANT: You are ONLY authorized to answer questions related to clinical trials, "
            f"regulatory compliance, protocol design, drug development, payer/HTA strategy, "
            f"and biomedical/pharmaceutical topics. If the user asks a question that is "
            f"clearly unrelated to clinical trials or healthcare, politely decline and redirect "
            f"them to ask about their clinical trial protocol.\n\n"
            f"--- DOCUMENT CONTEXT ---\n{doc_excerpt}\n--- END CONTEXT ---\n\n"
            f"User question: {query}"
        )

    try:
        response_text = invoke_model(prompt, max_tokens=2000, temperature=0.3)
        logger.info(
            "Direct chat fallback: query=%s, doc_chars=%d, response_chars=%d",
            query[:60], len(doc_excerpt), len(response_text),
        )

        # Extract inline citations from the response text
        citations = _extract_inline_guideline_citations(
            response_text, ICH_GUIDELINES, FDA_GUIDANCE, HTA_BODY_REFS
        )

        # Add source transparency note
        disclaimer = (
            "\n\n*Sources: Citations above reference publicly published regulatory guidelines "
            "(ICH, FDA, EMA, HTA bodies). Click any citation to open the official document. "
            "For answers grounded on your own uploaded protocols and documents, populate your "
            "Document Library via the References tab.*"
        )
        
        return {
            "text": response_text + disclaimer,
            "citations": citations,
            "session_id": None,
            "is_refusal": False,
            "grounding_source": "regulatory_authority",  # Public official sources
            "kb_grounded": False,
        }
    except Exception as exc:
        logger.error("Direct chat fallback failed: %s", exc)
        raise BedrockError(str(exc))


def _extract_inline_guideline_citations(
    text: str,
    ich_guidelines: dict,
    fda_guidance: dict,
    hta_body_refs: dict,
) -> list[dict]:
    """
    Scan AI response text for mentions of known guidelines and generate
    structured citations with URLs. This ensures even direct (non-RAG)
    chat responses have traceable, clickable citations.
    """
    citations = []
    text_lower = text.lower()
    seen = set()

    # Scan for ICH guideline references (e.g. "ICH E6(R3)", "E9(R1)")
    for code, info in ich_guidelines.items():
        # Match both "ICH E6(R3)" and bare "E6(R3)"
        if code.lower() in text_lower or f"ich {code.lower()}" in text_lower:
            if code not in seen:
                seen.add(code)
                # Try to extract the section number mentioned near this reference
                section = _extract_section_near(text, code)
                citations.append({
                    "text": f"{info['title']} — {info['focus']}",
                    "source": f"ICH {code}",
                    "source_type": "ICH",
                    "url": info["url"],
                    "section": section,
                    "score": 0.95,
                })

    # Scan for FDA guidance references
    for key, info in fda_guidance.items():
        key_lower = key.lower()
        title_words = info["title"].lower().split()[:4]
        title_fragment = " ".join(title_words)
        if key_lower in text_lower or title_fragment in text_lower:
            if key not in seen:
                seen.add(key)
                citations.append({
                    "text": f"{info['title']} ({info['year']}) — {info['focus']}",
                    "source": f"FDA {key}",
                    "source_type": "FDA",
                    "url": info["url"],
                    "section": None,
                    "score": 0.90,
                })

    # Scan for HTA body mentions
    for key, info in hta_body_refs.items():
        if key.lower() in text_lower:
            if key not in seen:
                seen.add(key)
                citations.append({
                    "text": info["title"],
                    "source": key,
                    "source_type": "HTA",
                    "url": info["url"],
                    "section": None,
                    "score": 0.85,
                })

    return citations


def _extract_section_near(text: str, guideline_code: str) -> Optional[str]:
    """Extract section number mentioned near a guideline reference in text."""
    # Look for patterns like "Section 5.2.1" or "§ 5.2" near the guideline code
    pattern = re.compile(
        re.escape(guideline_code) + r'[^.]{0,60}(?:section|§)\s*([\d]+(?:\.[\d]+)*)',
        re.IGNORECASE,
    )
    match = pattern.search(text)
    if match:
        return match.group(1)
    return None


def _build_chat_prompt(
    query: str,
    document_text: str,
    user_name: str = "User",
    user_org: str = "Independent",
) -> str:
    """Build the chat prompt for direct Converse API calls."""
    max_doc_chars = 12_000
    doc_excerpt = document_text[:max_doc_chars] if document_text else ""

    guideline_instruction = (
        "When referencing guidelines, always include the specific guideline code "
        "(e.g., 'ICH E6(R3) Section 5.2.1', 'FDA Adaptive Designs Guidance'). "
    )

    topic_guardrail = (
        "IMPORTANT: You are ONLY authorized to answer questions related to clinical trials, "
        "regulatory compliance, protocol design, drug development, payer/HTA strategy, "
        "and biomedical/pharmaceutical topics. If the user asks a question that is "
        "clearly unrelated to clinical trials or healthcare (e.g., cooking, sports, "
        "entertainment, politics, general knowledge), politely decline and say: "
        "'I'm NIX AI, specialized in clinical trial protocol analysis. "
        "I can help with regulatory compliance, trial design, endpoint strategy, "
        "payer readiness, and protocol optimization. Please ask me about your "
        "clinical trial protocol.' "
    )

    if not doc_excerpt:
        return (
            f"You are NIX AI, an expert clinical trial protocol analyst. "
            f"The user is {user_name} from {user_org}. "
            f"No document is currently loaded. Answer the user's question "
            f"helpfully based on your clinical trial expertise. "
            f"{guideline_instruction}"
            f"If you need a document to give a specific answer, ask the user to upload one.\n\n"
            f"{topic_guardrail}\n\n"
            f"User question: {query}"
        )
    return (
        f"You are NIX AI, an expert clinical trial protocol analyst. "
        f"The user is {user_name} from {user_org}. "
        f"Answer their question using the document context below. "
        f"Cite specific sections when possible. Be thorough but concise. "
        f"{guideline_instruction}\n\n"
        f"{topic_guardrail}\n\n"
        f"--- DOCUMENT CONTEXT ---\n{doc_excerpt}\n--- END CONTEXT ---\n\n"
        f"User question: {query}"
    )


def direct_chat_stream(
    query: str,
    document_text: str,
    user_name: str = "User",
    user_org: str = "Independent",
) -> Generator[str, None, None]:
    """
    Streaming version of direct_chat.
    Yields text chunks as they arrive from Bedrock ConverseStream API.
    """
    prompt = _build_chat_prompt(query, document_text, user_name, user_org)
    logger.info(
        "Starting direct chat stream: query=%s, doc_chars=%d",
        query[:60], len(document_text) if document_text else 0,
    )
    yield from invoke_model_stream(prompt, max_tokens=2000, temperature=0.3)


def _extract_citations(response: dict) -> list[dict]:
    """
    Parse citations from Bedrock RetrieveAndGenerate response.
    Enriches S3-based citations with source type, friendly names, and
    official guideline URLs where the KB document is a known guideline.
    """
    citations = []
    _ensure_ich_urls_loaded()
    for citation_group in response.get("citations", []):
        for ref in citation_group.get("retrievedReferences", []):
            content = ref.get("content", {}).get("text", "")
            location = ref.get("location", {})
            s3_uri = location.get("s3Location", {}).get("uri", "")
            raw_filename = s3_uri.split("/")[-1] if s3_uri else "Unknown"

            # Build a clean human-readable name (strip extension, replace separators)
            clean_name = raw_filename
            for ext in (".pdf", ".json", ".txt", ".md", ".docx", ".doc"):
                clean_name = clean_name.removesuffix(ext)
            clean_name = clean_name.replace("_", " ").replace("-", " ").strip()

            # Determine source type from file name
            name_lower = raw_filename.lower()
            source_type = "knowledge_base"
            url = None
            if "ich" in name_lower:
                source_type = "ICH"
                # Try to match against known ICH guidelines for an official URL
                for code, info in _ICH_GUIDELINES_URLS.items():
                    if code.lower().replace("(", "").replace(")", "") in name_lower:
                        url = info.get("url")
                        clean_name = info.get("title", clean_name)
                        break
            elif "fda" in name_lower:
                source_type = "FDA"
            elif "ema" in name_lower or "chmp" in name_lower:
                source_type = "EMA"
            elif "nice" in name_lower or "hta" in name_lower or "payer" in name_lower or "iqwig" in name_lower or "cadth" in name_lower:
                source_type = "HTA"

            citations.append({
                "text": content[:500],
                "source": clean_name or raw_filename,
                "source_type": source_type,
                "section": ref.get("metadata", {}).get("section", None),
                "score": ref.get("metadata", {}).get("score", None),
                "s3_uri": s3_uri if s3_uri else None,
                "url": url,  # Official URL when the KB file matches a known guideline
            })
    return citations


# Lazy reference to ICH guideline URLs (avoids circular import at module load)
def _get_ich_guidelines_urls() -> dict:
    try:
        from app.services.regulatory_engine import ICH_GUIDELINES
        return ICH_GUIDELINES
    except Exception:
        return {}


_ICH_GUIDELINES_URLS: dict = {}  # Populated on first use via _extract_citations


def _ensure_ich_urls_loaded() -> None:
    global _ICH_GUIDELINES_URLS
    if not _ICH_GUIDELINES_URLS:
        _ICH_GUIDELINES_URLS = _get_ich_guidelines_urls()


# ════════════════════════════════════════════════════════════════
# 2.  Direct Model Invocation — Converse API (all models)
# ════════════════════════════════════════════════════════════════
def invoke_model(
    prompt: str, max_tokens: int = 2000, temperature: float = 0.3,
    cache_ttl: int = CACHE_TTL_STRATEGIC, use_cache: bool = True,
) -> str:
    """
    Call Bedrock Converse API directly (no Knowledge Base).
    Works with all Bedrock models: Amazon Nova, Anthropic Claude, etc.
    Used by the Worker Lambda for synthetic data generation & analysis.

    Resilience features:
    - LLM response caching (skip redundant calls)
    - Exponential backoff with jitter (handle throttling)
    - Circuit breaker (prevent cascading failures)
    - Rate limiting (stay under Bedrock API limits)
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()
    model_id = settings.BEDROCK_MODEL_ID

    # ── Check LLM cache ──
    if use_cache:
        cached = llm_cache.get(
            prompt, model_id=model_id,
            temperature=temperature, max_tokens=max_tokens,
        )
        if cached is not None:
            logger.info(
                "LLM cache HIT: model=%s, prompt_len=%d",
                model_id, len(prompt),
            )
            return cached

    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}],
        }
    ]

    def _do_converse():
        return client.converse(
            modelId=model_id,
            messages=messages,
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": temperature,
                "topP": 0.9,
            },
        )

    # ── Rate limit → Circuit breaker → Retry with backoff ──
    last_exception = None
    for attempt in range(BEDROCK_RETRY_CONFIG.max_retries + 1):
        try:
            # Rate limit
            if not bedrock_rate_limiter.acquire(timeout=15.0):
                logger.warning("Rate limiter timeout for invoke_model")
                raise BedrockError("Service temporarily busy. Please try again in a few seconds.")

            # Circuit breaker wraps the actual call
            response = bedrock_circuit.call(_do_converse)

            # Extract text from the Converse API response
            output_message = response.get("output", {}).get("message", {})
            content_blocks = output_message.get("content", [])
            result_text = ""
            for block in content_blocks:
                if "text" in block:
                    result_text += block["text"]

            logger.info(
                "Bedrock Converse: model=%s, input_tokens=%s, output_tokens=%s, attempt=%d",
                model_id,
                response.get("usage", {}).get("inputTokens", "?"),
                response.get("usage", {}).get("outputTokens", "?"),
                attempt + 1,
            )

            # ── Cache the successful response ──
            if use_cache and result_text:
                try:
                    llm_cache.put(
                        prompt, result_text, model_id=model_id,
                        temperature=temperature, max_tokens=max_tokens,
                        ttl=cache_ttl,
                    )
                except Exception:
                    pass  # Cache write failure is non-critical

            return result_text

        except CircuitBreakerError as cbe:
            logger.error("Bedrock circuit breaker OPEN: %s", cbe)
            raise BedrockError(
                "AI service is temporarily unavailable due to high error rate. "
                f"Automatic recovery in {cbe.reset_time:.0f}s."
            )
        except BedrockError:
            raise
        except Exception as exc:
            last_exception = exc
            # Check if retryable
            error_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            is_throttle = error_code in (
                "ThrottlingException", "TooManyRequestsException",
                "ServiceUnavailableException", "ModelTimeoutException",
                "ProvisionedThroughputExceededException",
            )
            is_server_error = getattr(exc, "response", {}).get(
                "ResponseMetadata", {}
            ).get("HTTPStatusCode", 0) >= 500

            if attempt < BEDROCK_RETRY_CONFIG.max_retries and (is_throttle or is_server_error):
                import random as _random
                delay = min(
                    BEDROCK_RETRY_CONFIG.base_delay * (2 ** attempt),
                    BEDROCK_RETRY_CONFIG.max_delay,
                )
                delay = _random.uniform(0, delay)  # Full jitter
                logger.warning(
                    "Bedrock Converse attempt %d/%d failed (%s: %s). Retrying in %.2fs...",
                    attempt + 1, BEDROCK_RETRY_CONFIG.max_retries + 1,
                    type(exc).__name__, error_code or str(exc)[:100], delay,
                )
                time.sleep(delay)
                continue

            logger.error("Bedrock Converse failed after %d attempts: %s", attempt + 1, exc)
            raise BedrockError(str(exc))

    raise BedrockError(str(last_exception))


def invoke_model_stream(
    prompt: str, max_tokens: int = 2000, temperature: float = 0.3
) -> Generator[str, None, None]:
    """
    Call Bedrock ConverseStream API for streaming responses.
    Yields text chunks as they arrive.
    Works with all Bedrock models: Amazon Nova, Anthropic Claude, etc.

    Resilience: Rate limiting + circuit breaker (no cache for streaming).
    Retry is handled at the caller level for streaming.
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()

    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}],
        }
    ]

    # Rate limit before streaming call
    if not bedrock_rate_limiter.acquire(timeout=15.0):
        logger.warning("Rate limiter timeout for streaming call")
        raise BedrockError("Service temporarily busy. Please try again in a few seconds.")

    try:
        def _do_stream():
            return client.converse_stream(
                modelId=settings.BEDROCK_MODEL_ID,
                messages=messages,
                inferenceConfig={
                    "maxTokens": max_tokens,
                    "temperature": temperature,
                    "topP": 0.9,
                },
            )

        streaming_response = bedrock_circuit.call(_do_stream)

        for chunk in streaming_response.get("stream", []):
            if "contentBlockDelta" in chunk:
                delta = chunk["contentBlockDelta"].get("delta", {})
                if "text" in delta:
                    yield delta["text"]

    except CircuitBreakerError as cbe:
        logger.error("Bedrock streaming circuit breaker OPEN: %s", cbe)
        raise BedrockError(
            "AI service is temporarily unavailable. "
            f"Automatic recovery in {cbe.reset_time:.0f}s."
        )
    except BedrockError:
        raise
    except Exception as exc:
        logger.error("Bedrock ConverseStream failed: %s", exc)
        raise BedrockError(str(exc))


# ════════════════════════════════════════════════════════════════
# 3.  Native Document Analysis — Converse API DocumentBlock
# ════════════════════════════════════════════════════════════════
def _detect_document_format(filename: str) -> Optional[str]:
    """Detect document format from filename extension."""
    ext = os.path.splitext(filename.lower())[1]
    return DOCUMENT_FORMATS.get(ext)


def _sanitize_document_name(filename: str) -> str:
    """
    Sanitize filename for Bedrock DocumentBlock name field.
    Allowed: alphanumeric, whitespace, hyphens, parens, square brackets.
    """
    name = os.path.splitext(os.path.basename(filename))[0]
    name = re.sub(r"[^a-zA-Z0-9\s\-\(\)\[\]]", "-", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:200] or "document"


def _build_preference_instructions(preferences: dict | None) -> str:
    """
    Build additional analysis instructions from user preferences.
    These come from the ConfigurationView in the frontend.
    """
    if not preferences:
        return ""

    parts = []
    sensitivity = preferences.get("risk_sensitivity", "balanced")
    focus = preferences.get("analysis_focus", "both")
    include_recs = preferences.get("include_recommendations", True)
    reg_threshold = preferences.get("regulatory_threshold", 50)
    pay_threshold = preferences.get("payer_threshold", 50)

    if sensitivity == "conservative":
        parts.append("Use CONSERVATIVE risk sensitivity: flag more potential issues even with lower confidence. Prioritize safety — fewer false negatives.")
    elif sensitivity == "aggressive":
        parts.append("Use AGGRESSIVE risk sensitivity: only flag high-confidence issues. Prioritize precision — fewer false positives.")

    if focus == "regulatory":
        parts.append("FOCUS PRIMARILY on regulatory compliance (FDA/EMA). Payer analysis is secondary.")
    elif focus == "payer":
        parts.append("FOCUS PRIMARILY on payer/reimbursement viability. Regulatory analysis is secondary.")

    if not include_recs:
        parts.append("Do NOT include recommendation-type findings. Focus only on conflicts and risks.")

    parts.append(f"Risk thresholds: regulatory scores below {reg_threshold}% should be flagged as HIGH RISK. Payer scores below {pay_threshold}% should be flagged as LOW VIABILITY.")

    return "\n\nUser analysis preferences:\n" + "\n".join(f"- {p}" for p in parts) + "\n"


def analyze_document_native(
    document_bytes: bytes,
    filename: str,
    max_tokens: int = 4000,
    temperature: float = 0.2,
    preferences: dict | None = None,
) -> dict:
    """
    Send a document directly to Bedrock via the Converse API DocumentBlock.

    The model natively reads the PDF with full layout, table, and image
    understanding — no text extraction needed.

    Supports: PDF, CSV, DOC, DOCX, XLS, XLSX, HTML, TXT, MD (up to 4.5 MB).

    Falls back to text-based analysis for unsupported formats or oversized files.
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()

    doc_format = _detect_document_format(filename)
    doc_name = _sanitize_document_name(filename)

    # ── Guard: size & format ─────────────────────────────────────
    if doc_format is None:
        logger.warning(
            "Unsupported format for native analysis: %s — falling back to text",
            filename,
        )
        return None  # Caller should fall back to text-based analysis

    if len(document_bytes) > MAX_DOCUMENT_BYTES:
        logger.warning(
            "Document too large for native analysis (%d bytes > %d) — falling back to text",
            len(document_bytes),
            MAX_DOCUMENT_BYTES,
        )
        return None  # Caller should fall back to text-based analysis

    # ── Build Converse API request with DocumentBlock ────────────
    from app.services.regulatory_engine import build_enhanced_analysis_prompt
    analysis_prompt = build_enhanced_analysis_prompt(preferences)

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "document": {
                        "name": doc_name,
                        "format": doc_format,
                        "source": {
                            "bytes": document_bytes,
                        },
                    },
                },
                {
                    "text": analysis_prompt,
                },
            ],
        }
    ]

    def _do_native_analysis():
        return client.converse(
            modelId=settings.BEDROCK_MODEL_ID,
            messages=messages,
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": temperature,
                "topP": 0.9,
            },
        )

    # ── Rate limit + Circuit breaker + Retry ──
    last_exception = None
    for attempt in range(BEDROCK_RETRY_CONFIG.max_retries + 1):
        try:
            if not bedrock_rate_limiter.acquire(timeout=20.0):
                raise BedrockError("Service temporarily busy. Please try again.")

            response = bedrock_circuit.call(_do_native_analysis)

            output_message = response.get("output", {}).get("message", {})
            content_blocks = output_message.get("content", [])
            result_text = ""
            for block in content_blocks:
                if "text" in block:
                    result_text += block["text"]

            logger.info(
                "Bedrock native document analysis: model=%s, format=%s, "
                "size=%d bytes, input_tokens=%s, output_tokens=%s, attempt=%d",
                settings.BEDROCK_MODEL_ID,
                doc_format,
                len(document_bytes),
                response.get("usage", {}).get("inputTokens", "?"),
                response.get("usage", {}).get("outputTokens", "?"),
                attempt + 1,
            )

            # Parse JSON response
            json_str = _extract_json_object(result_text)
            if json_str:
                result = json.loads(json_str)
                result["extraction_method"] = "native_document_block"
                return result

            return {
                "summary": result_text,
                "regulatorScore": 0,
                "payerScore": 0,
                "findings": [],
                "extraction_method": "native_document_block",
            }

        except CircuitBreakerError as cbe:
            raise BedrockError(
                f"AI service temporarily unavailable. Recovery in {cbe.reset_time:.0f}s."
            )
        except BedrockError:
            raise
        except Exception as exc:
            last_exception = exc
            error_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            is_retryable = error_code in (
                "ThrottlingException", "TooManyRequestsException",
                "ServiceUnavailableException", "ModelTimeoutException",
            )
            if attempt < BEDROCK_RETRY_CONFIG.max_retries and is_retryable:
                import random as _random
                delay = min(BEDROCK_RETRY_CONFIG.base_delay * (2 ** attempt), BEDROCK_RETRY_CONFIG.max_delay)
                delay = _random.uniform(0, delay)
                logger.warning(
                    "Native analysis attempt %d/%d failed (%s). Retrying in %.2fs...",
                    attempt + 1, BEDROCK_RETRY_CONFIG.max_retries + 1, error_code, delay,
                )
                time.sleep(delay)
                continue

            logger.error("Native document analysis failed after %d attempts: %s", attempt + 1, exc)
            raise BedrockError(str(exc))

    raise BedrockError(str(last_exception))


def analyze_document(document_text: str, preferences: dict | None = None) -> dict:
    """
    LEGACY: Send extracted text to Bedrock for regulatory + payer analysis.
    Used as fallback when native DocumentBlock analysis is not available
    (unsupported format, oversized file, or model doesn't support documents).

    Resilience: Uses invoke_model which has built-in caching, retry, and circuit breaker.
    """
    from app.services.regulatory_engine import build_enhanced_analysis_prompt
    prompt = build_enhanced_analysis_prompt(preferences) + f"""

Document text:
---
{document_text[:8000]}
---

Respond with ONLY valid JSON. No markdown, no explanation."""

    raw = ""
    try:
        raw = invoke_model(prompt, max_tokens=3000, temperature=0.2,
                           cache_ttl=CACHE_TTL_ANALYSIS)
        # Try to parse as JSON
        json_str = _extract_json_object(raw)
        if json_str:
            result = json.loads(json_str)
            result["extraction_method"] = "text_fallback"
            return result
        return {"summary": raw, "regulatorScore": 0, "payerScore": 0, "findings": [], "extraction_method": "text_fallback"}
    except BedrockError:
        raise
    except json.JSONDecodeError:
        return {"summary": raw[:500] if raw else "Analysis response could not be parsed", "regulatorScore": 0, "payerScore": 0, "findings": [], "extraction_method": "text_fallback"}
    except Exception as exc:
        logger.error("analyze_document unexpected error: %s", exc)
        raise BedrockError(f"Document analysis failed: {str(exc)[:200]}")


# ════════════════════════════════════════════════════════════════
# 4.  Amazon Textract — Structured Data Extraction
# ════════════════════════════════════════════════════════════════
def extract_tables_with_textract(
    document_bytes: bytes,
    filename: str = "document.pdf",
) -> dict:
    """
    Use Amazon Textract to extract structured data from a document.

    Returns tables as structured JSON and raw text with layout preservation.
    Best for: dosing tables, inclusion/exclusion criteria, statistical tables.

    Textract pricing:
    - DetectDocumentText: $1.50 / 1000 pages
    - AnalyzeDocument (tables+forms): $15 / 1000 pages
    """
    settings = get_settings()

    try:
        import boto3
        textract = boto3.client("textract", **settings.boto3_credentials)

        # Use AnalyzeDocument for table + form extraction
        response = textract.analyze_document(
            Document={"Bytes": document_bytes},
            FeatureTypes=["TABLES", "FORMS"],
        )

        blocks = response.get("Blocks", [])

        # Extract raw text with layout
        lines = []
        tables = []
        key_values = []

        # Index blocks by ID for relationship lookups
        block_map = {b["Id"]: b for b in blocks}

        for block in blocks:
            if block["BlockType"] == "LINE":
                lines.append(block.get("Text", ""))
            elif block["BlockType"] == "TABLE":
                table = _parse_textract_table(block, block_map)
                if table:
                    tables.append(table)
            elif block["BlockType"] == "KEY_VALUE_SET" and block.get("EntityTypes", [None])[0] == "KEY":
                kv = _parse_textract_key_value(block, block_map)
                if kv:
                    key_values.append(kv)

        result = {
            "text": "\n".join(lines),
            "tables": tables,
            "key_values": key_values,
            "page_count": max(
                (b.get("Page", 0) for b in blocks), default=0
            ),
            "extraction_method": "textract",
        }

        logger.info(
            "Textract extraction complete: %s — %d lines, %d tables, %d key-value pairs",
            filename,
            len(lines),
            len(tables),
            len(key_values),
        )
        return result

    except Exception as exc:
        logger.error("Textract extraction failed for %s: %s", filename, exc)
        return {
            "text": "",
            "tables": [],
            "key_values": [],
            "error": str(exc),
            "extraction_method": "textract_failed",
        }


def _parse_textract_table(table_block: dict, block_map: dict) -> Optional[list]:
    """Parse a Textract TABLE block into a 2D array of cell text."""
    rows = {}
    for rel in table_block.get("Relationships", []):
        if rel["Type"] == "CHILD":
            for child_id in rel["Ids"]:
                cell = block_map.get(child_id, {})
                if cell.get("BlockType") == "CELL":
                    row_idx = cell.get("RowIndex", 0)
                    col_idx = cell.get("ColumnIndex", 0)
                    # Get cell text from child WORD blocks
                    cell_text = _get_text_from_children(cell, block_map)
                    if row_idx not in rows:
                        rows[row_idx] = {}
                    rows[row_idx][col_idx] = cell_text

    if not rows:
        return None

    # Convert to 2D list
    max_row = max(rows.keys())
    max_col = max(c for r in rows.values() for c in r.keys())
    table = []
    for r in range(1, max_row + 1):
        row = []
        for c in range(1, max_col + 1):
            row.append(rows.get(r, {}).get(c, ""))
        table.append(row)
    return table


def _parse_textract_key_value(key_block: dict, block_map: dict) -> Optional[dict]:
    """Parse a Textract KEY_VALUE_SET into {key, value}."""
    key_text = _get_text_from_children(key_block, block_map)

    # Find the VALUE block
    value_text = ""
    for rel in key_block.get("Relationships", []):
        if rel["Type"] == "VALUE":
            for val_id in rel["Ids"]:
                val_block = block_map.get(val_id, {})
                value_text = _get_text_from_children(val_block, block_map)

    if key_text:
        return {"key": key_text.strip(), "value": value_text.strip()}
    return None


def _get_text_from_children(block: dict, block_map: dict) -> str:
    """Extract text from WORD/SELECTION_ELEMENT children of a block."""
    words = []
    for rel in block.get("Relationships", []):
        if rel["Type"] == "CHILD":
            for child_id in rel["Ids"]:
                child = block_map.get(child_id, {})
                if child.get("BlockType") == "WORD":
                    words.append(child.get("Text", ""))
                elif child.get("BlockType") == "SELECTION_ELEMENT":
                    words.append("☑" if child.get("SelectionStatus") == "SELECTED" else "☐")
    return " ".join(words)


# ════════════════════════════════════════════════════════════════
# Mock responses for local dev without Bedrock
# ════════════════════════════════════════════════════════════════
def _mock_rag_response(query: str, user_name: str, user_org: str) -> dict:
    return {
        "text": (
            f"Hello {user_name} from {user_org}. Based on the clinical protocols, "
            f"here is my analysis regarding '{query}': The protocol shows strong "
            f"alignment with FDA guidance on endpoint selection. However, I recommend "
            f"reviewing Section 4.2 for potential cardiac safety monitoring gaps. "
            f"The statistical analysis plan in Section 8 should include interim "
            f"futility analysis boundaries."
        ),
        "citations": [
            {"text": "Section 4.2 — Cardiac Safety Monitoring", "source": "Protocol_v1.2.pdf", "section": "4.2", "score": 0.95},
            {"text": "FDA Guidance on Cardiac Safety (2024)", "source": "FDA_Guidance_2024.pdf", "section": "3.1", "score": 0.88},
        ],
        "session_id": None,
    }
