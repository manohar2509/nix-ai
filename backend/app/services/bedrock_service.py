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
from typing import Generator, Optional

from app.core.aws_clients import get_bedrock_agent_client, get_bedrock_runtime_client
from app.core.config import get_settings
from app.core.exceptions import BedrockError

logger = logging.getLogger(__name__)

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
        logger.warning("BEDROCK_KB_ID not configured — returning mock response")
        return _mock_rag_response(query, user_name, user_org)

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
                            f"Cite specific sections. If unsure, say so.\n\n"
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

    try:
        response = client.retrieve_and_generate(**request_params)

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
        return {
            "text": text,
            "citations": citations,
            "session_id": new_session_id,
            "is_refusal": False,
        }
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
    """
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
            f"If you need a document to give a specific answer, ask the user to upload one.\n\n"
            f"User question: {query}"
        )
    else:
        prompt = (
            f"You are NIX AI, an expert clinical trial protocol analyst. "
            f"The user is {user_name} from {user_org}. "
            f"Answer their question using the document context below. "
            f"Cite specific sections when possible. Be thorough but concise.\n\n"
            f"--- DOCUMENT CONTEXT ---\n{doc_excerpt}\n--- END CONTEXT ---\n\n"
            f"User question: {query}"
        )

    try:
        response_text = invoke_model(prompt, max_tokens=2000, temperature=0.3)
        logger.info(
            "Direct chat fallback: query=%s, doc_chars=%d, response_chars=%d",
            query[:60], len(doc_excerpt), len(response_text),
        )
        return {
            "text": response_text,
            "citations": [],
            "session_id": None,
            "is_refusal": False,
        }
    except Exception as exc:
        logger.error("Direct chat fallback failed: %s", exc)
        raise BedrockError(str(exc))


def _build_chat_prompt(
    query: str,
    document_text: str,
    user_name: str = "User",
    user_org: str = "Independent",
) -> str:
    """Build the chat prompt for direct Converse API calls."""
    max_doc_chars = 12_000
    doc_excerpt = document_text[:max_doc_chars] if document_text else ""

    if not doc_excerpt:
        return (
            f"You are NIX AI, an expert clinical trial protocol analyst. "
            f"The user is {user_name} from {user_org}. "
            f"No document is currently loaded. Answer the user's question "
            f"helpfully based on your clinical trial expertise. "
            f"If you need a document to give a specific answer, ask the user to upload one.\n\n"
            f"User question: {query}"
        )
    return (
        f"You are NIX AI, an expert clinical trial protocol analyst. "
        f"The user is {user_name} from {user_org}. "
        f"Answer their question using the document context below. "
        f"Cite specific sections when possible. Be thorough but concise.\n\n"
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
    """Parse citations from Bedrock RetrieveAndGenerate response."""
    citations = []
    for citation_group in response.get("citations", []):
        for ref in citation_group.get("retrievedReferences", []):
            content = ref.get("content", {}).get("text", "")
            location = ref.get("location", {})
            s3_uri = location.get("s3Location", {}).get("uri", "")
            source = s3_uri.split("/")[-1] if s3_uri else "Unknown"

            citations.append({
                "text": content[:500],
                "source": source,
                "section": ref.get("metadata", {}).get("section", None),
                "score": ref.get("metadata", {}).get("score", None),
            })
    return citations


# ════════════════════════════════════════════════════════════════
# 2.  Direct Model Invocation — Converse API (all models)
# ════════════════════════════════════════════════════════════════
def invoke_model(
    prompt: str, max_tokens: int = 2000, temperature: float = 0.3
) -> str:
    """
    Call Bedrock Converse API directly (no Knowledge Base).
    Works with all Bedrock models: Amazon Nova, Anthropic Claude, etc.
    Used by the Worker Lambda for synthetic data generation & analysis.
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()

    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}],
        }
    ]

    try:
        response = client.converse(
            modelId=settings.BEDROCK_MODEL_ID,
            messages=messages,
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": temperature,
                "topP": 0.9,
            },
        )

        # Extract text from the Converse API response
        output_message = response.get("output", {}).get("message", {})
        content_blocks = output_message.get("content", [])
        result_text = ""
        for block in content_blocks:
            if "text" in block:
                result_text += block["text"]

        logger.info(
            "Bedrock Converse: model=%s, input_tokens=%s, output_tokens=%s",
            settings.BEDROCK_MODEL_ID,
            response.get("usage", {}).get("inputTokens", "?"),
            response.get("usage", {}).get("outputTokens", "?"),
        )
        return result_text

    except Exception as exc:
        logger.error("Bedrock Converse failed: %s", exc)
        raise BedrockError(str(exc))


def invoke_model_stream(
    prompt: str, max_tokens: int = 2000, temperature: float = 0.3
) -> Generator[str, None, None]:
    """
    Call Bedrock ConverseStream API for streaming responses.
    Yields text chunks as they arrive.
    Works with all Bedrock models: Amazon Nova, Anthropic Claude, etc.
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()

    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}],
        }
    ]

    try:
        streaming_response = client.converse_stream(
            modelId=settings.BEDROCK_MODEL_ID,
            messages=messages,
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": temperature,
                "topP": 0.9,
            },
        )

        for chunk in streaming_response.get("stream", []):
            if "contentBlockDelta" in chunk:
                delta = chunk["contentBlockDelta"].get("delta", {})
                if "text" in delta:
                    yield delta["text"]

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
    pref_instructions = _build_preference_instructions(preferences)
    analysis_prompt = f"""You are NIX AI, an expert clinical trial protocol analyst.

Analyze this clinical trial protocol document thoroughly and return a JSON response with:
1. "regulatorScore" (0-100): FDA/EMA regulatory compliance score
2. "payerScore" (0-100): Payer/reimbursement readiness score
3. "findings": Array of objects with:
   - "id": unique string
   - "type": "conflict" | "recommendation" | "risk"
   - "severity": "low" | "medium" | "high" | "critical"
   - "title": short title
   - "description": detailed description
   - "section": which protocol section
   - "suggestion": recommended fix
4. "summary": 2-3 sentence executive summary
5. "tables_detected": number of data tables found in the document
6. "extraction_method": "native_document_block"

Pay special attention to:
- Tables containing dosing schedules, inclusion/exclusion criteria, endpoints
- Statistical analysis plan details
- Safety monitoring provisions
- Regulatory compliance gaps
{pref_instructions}
Respond with ONLY valid JSON. No markdown, no explanation."""

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

    try:
        response = client.converse(
            modelId=settings.BEDROCK_MODEL_ID,
            messages=messages,
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": temperature,
                "topP": 0.9,
            },
        )

        output_message = response.get("output", {}).get("message", {})
        content_blocks = output_message.get("content", [])
        result_text = ""
        for block in content_blocks:
            if "text" in block:
                result_text += block["text"]

        logger.info(
            "Bedrock native document analysis: model=%s, format=%s, "
            "size=%d bytes, input_tokens=%s, output_tokens=%s",
            settings.BEDROCK_MODEL_ID,
            doc_format,
            len(document_bytes),
            response.get("usage", {}).get("inputTokens", "?"),
            response.get("usage", {}).get("outputTokens", "?"),
        )

        # Parse JSON response
        json_match = re.search(r'\{[\s\S]*\}', result_text)
        if json_match:
            result = json.loads(json_match.group())
            result["extraction_method"] = "native_document_block"
            return result

        return {
            "summary": result_text,
            "regulatorScore": 0,
            "payerScore": 0,
            "findings": [],
            "extraction_method": "native_document_block",
        }

    except Exception as exc:
        logger.error("Native document analysis failed: %s", exc)
        raise BedrockError(str(exc))


def analyze_document(document_text: str, preferences: dict | None = None) -> dict:
    """
    LEGACY: Send extracted text to Bedrock for regulatory + payer analysis.
    Used as fallback when native DocumentBlock analysis is not available
    (unsupported format, oversized file, or model doesn't support documents).
    """
    pref_instructions = _build_preference_instructions(preferences)
    prompt = f"""You are NIX AI, an expert clinical trial protocol analyst.

Analyze this clinical trial protocol document and return a JSON response with:
1. "regulatorScore" (0-100): FDA/EMA regulatory compliance score
2. "payerScore" (0-100): Payer/reimbursement readiness score
3. "findings": Array of objects with:
   - "id": unique string
   - "type": "conflict" | "recommendation" | "risk"
   - "severity": "low" | "medium" | "high" | "critical"
   - "title": short title
   - "description": detailed description
   - "section": which protocol section
   - "suggestion": recommended fix
4. "summary": 2-3 sentence executive summary
5. "extraction_method": "text_fallback"
{pref_instructions}
Document text:
---
{document_text[:8000]}
---

Respond with ONLY valid JSON. No markdown, no explanation."""

    try:
        raw = invoke_model(prompt, max_tokens=3000, temperature=0.2)
        # Try to parse as JSON
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            result = json.loads(json_match.group())
            result["extraction_method"] = "text_fallback"
            return result
        return {"summary": raw, "regulatorScore": 0, "payerScore": 0, "findings": [], "extraction_method": "text_fallback"}
    except BedrockError:
        raise
    except json.JSONDecodeError:
        return {"summary": raw[:500], "regulatorScore": 0, "payerScore": 0, "findings": [], "extraction_method": "text_fallback"}


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
