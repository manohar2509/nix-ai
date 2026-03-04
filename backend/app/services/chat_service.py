"""
NIX AI — Chat Business Logic

Orchestrates the chat flow:
  User message → save to DynamoDB → call Bedrock RAG → save response → return
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Generator, Optional

from app.core.auth import CurrentUser
from app.services import bedrock_service, dynamo_service

logger = logging.getLogger(__name__)


def send_message(
    user: CurrentUser, doc_id: Optional[str], message: str
) -> dict:
    """
    Process a user's chat message.

    Flow:
      1. Save the user message to DynamoDB
      2. Try Bedrock KB RAG first
      3. If RAG returns a refusal (KB empty / no docs indexed),
         fall back to direct Converse API with the document text
      4. Save the AI response to DynamoDB
      5. Return the response with citations
    """
    effective_doc_id = doc_id or "global"

    # 1. Persist the user's message
    user_msg = dynamo_service.create_chat_message(
        doc_id=effective_doc_id,
        user_id=user.user_id,
        role="user",
        text=message,
    )

    # 2. Try Bedrock KB RAG first
    try:
        rag_result = bedrock_service.rag_chat(
            query=message,
            user_name=user.name,
            user_org=user.organization,
        )
    except Exception as exc:
        logger.warning("RAG call failed, will try direct fallback: %s", exc)
        rag_result = {"text": "", "citations": [], "session_id": None, "is_refusal": True}

    # 3. If RAG returned a refusal, fall back to direct model with doc text
    if rag_result.get("is_refusal"):
        logger.info(
            "RAG returned refusal for doc=%s — falling back to direct Converse API",
            effective_doc_id,
        )
        rag_result = _fallback_direct_chat(
            message=message,
            doc_id=effective_doc_id,
            user=user,
        )

        # If the direct fallback returned no citations, extract inline ones
        if not rag_result.get("citations"):
            from app.services.regulatory_engine import ICH_GUIDELINES, FDA_GUIDANCE, HTA_BODY_REFS
            rag_result["citations"] = bedrock_service._extract_inline_guideline_citations(
                rag_result.get("text", ""), ICH_GUIDELINES, FDA_GUIDANCE, HTA_BODY_REFS
            )

    # 4. Persist the AI response
    ai_msg = dynamo_service.create_chat_message(
        doc_id=effective_doc_id,
        user_id="assistant",
        role="assistant",
        text=rag_result["text"],
        citations=rag_result.get("citations", []),
        metadata={"session_id": rag_result.get("session_id")},
    )

    # 5. Return response matching frontend schema
    return {
        "id": ai_msg["id"],
        "text": rag_result["text"],
        "citations": rag_result.get("citations", []),
        "metadata": {
            "user_message_id": user_msg["id"],
            "session_id": rag_result.get("session_id"),
        },
    }


def _fallback_direct_chat(
    message: str, doc_id: str, user
) -> dict:
    """
    Fallback when RAG returns a refusal (KB has no indexed docs).
    Fetches the document text from S3 and uses the direct Converse API.
    """
    from app.services import s3_service

    document_text = ""
    if doc_id and doc_id != "global":
        try:
            doc = dynamo_service.get_document(doc_id)
            if doc and doc.get("s3_key"):
                document_text = s3_service.extract_text_from_s3_object(
                    doc["s3_key"]
                ) or ""
                logger.info(
                    "Loaded %d chars of document text for direct chat fallback",
                    len(document_text),
                )
        except Exception as exc:
            logger.warning("Could not load document text for fallback: %s", exc)

    return bedrock_service.direct_chat(
        query=message,
        document_text=document_text,
        user_name=user.name,
        user_org=user.organization,
    )


def get_history(user: CurrentUser, doc_id: str) -> list[dict]:
    """Get all chat messages for a document, with ownership check."""
    # Verify the caller owns the document
    if doc_id and doc_id != "global":
        doc = dynamo_service.get_document(doc_id)
        if doc and doc.get("user_id") and doc["user_id"] != user.user_id:
            return []  # Not the owner — return empty

    messages = dynamo_service.get_chat_history(doc_id)
    return [
        {
            "id": m["id"],
            "role": m["role"],
            "text": m["text"],
            "citations": m.get("citations", []),
            "created_at": m.get("created_at", ""),
        }
        for m in messages
    ]


def get_message_citations(user: CurrentUser, message_id: str) -> list[dict]:
    """Get citations for a specific AI message."""
    msg = dynamo_service.get_chat_message(message_id)
    if not msg:
        return []
    return msg.get("citations", [])


def submit_feedback(user: CurrentUser, message_id: str, feedback: str) -> dict:
    """Record feedback on an AI message (for analytics / RLHF)."""
    msg = dynamo_service.get_chat_message(message_id)
    if not msg:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Message not found")

    # Persist feedback in the message's metadata
    metadata = msg.get("metadata", {})
    metadata["feedback"] = feedback
    dynamo_service.update_chat_message(message_id, {"metadata": metadata})

    logger.info("Feedback persisted for message %s: %s", message_id, feedback)
    return {"success": True, "messageId": message_id, "feedback": feedback}


def clear_history(user: CurrentUser, doc_id: str) -> dict:
    """Delete all chat messages for a document, with ownership check."""
    # Verify the caller owns the document
    if doc_id and doc_id != "global":
        doc = dynamo_service.get_document(doc_id)
        if doc and doc.get("user_id") and doc["user_id"] != user.user_id:
            return {"success": False, "error": "Not authorized"}

    count = dynamo_service.delete_chat_history(doc_id)
    return {"success": True, "deleted": count}


# ════════════════════════════════════════════════════════════════
# STREAMING CHAT
# ════════════════════════════════════════════════════════════════
def send_message_stream(
    user: CurrentUser, doc_id: Optional[str], message: str
) -> Generator[str, None, None]:
    """
    Streaming version of send_message.

    Yields Server-Sent Events (SSE) as `data: {...}\\n\\n` lines:
      1. {"event":"start","messageId":"...","userMessageId":"..."}
      2. {"event":"token","text":"chunk..."}   (many of these)
      3. {"event":"done","messageId":"...","fullText":"..."}
      4. {"event":"error","message":"..."} (only on failure)

    After streaming completes, the full response is persisted to DynamoDB.
    """
    effective_doc_id = doc_id or "global"

    # 1. Persist the user's message
    user_msg = dynamo_service.create_chat_message(
        doc_id=effective_doc_id,
        user_id=user.user_id,
        role="user",
        text=message,
    )

    # Pre-generate the AI message ID so the frontend can reference it
    ai_msg_id = uuid.uuid4().hex[:16]

    # Send start event
    yield _sse({"event": "start", "messageId": ai_msg_id, "userMessageId": user_msg["id"]})

    # 2. Decide: RAG or direct fallback
    use_direct = False
    rag_citations = []

    try:
        rag_result = bedrock_service.rag_chat(
            query=message,
            user_name=user.name,
            user_org=user.organization,
        )
        if rag_result.get("is_refusal"):
            use_direct = True
        else:
            # RAG succeeded — but RAG is not streamable (RetrieveAndGenerate
            # returns the full response at once), so we emit it as tokens
            # in small chunks to give a streaming feel.
            rag_citations = rag_result.get("citations", [])
            full_text = rag_result["text"]
            # Emit in small chunks for streaming UX
            chunk_size = 12
            for i in range(0, len(full_text), chunk_size):
                yield _sse({"event": "token", "text": full_text[i:i + chunk_size]})
            # Done — persist and finish
            _persist_ai_message(effective_doc_id, ai_msg_id, full_text, rag_citations)
            yield _sse({
                "event": "done",
                "messageId": ai_msg_id,
                "fullText": full_text,
                "citations": rag_citations,
            })
            return
    except Exception as exc:
        logger.warning("RAG call failed, falling back to direct stream: %s", exc)
        use_direct = True

    # 3. Stream from direct Converse API with document context
    if use_direct:
        logger.info("Streaming direct chat for doc=%s", effective_doc_id)
        document_text = _load_document_text(effective_doc_id)
        full_text = ""

        try:
            for chunk in bedrock_service.direct_chat_stream(
                query=message,
                document_text=document_text,
                user_name=user.name,
                user_org=user.organization,
            ):
                full_text += chunk
                yield _sse({"event": "token", "text": chunk})

            # Extract inline guideline citations from the full response
            from app.services.regulatory_engine import ICH_GUIDELINES, FDA_GUIDANCE, HTA_BODY_REFS
            inline_citations = bedrock_service._extract_inline_guideline_citations(
                full_text, ICH_GUIDELINES, FDA_GUIDANCE, HTA_BODY_REFS
            )

            # Persist the complete response
            _persist_ai_message(effective_doc_id, ai_msg_id, full_text, inline_citations)
            yield _sse({
                "event": "done",
                "messageId": ai_msg_id,
                "fullText": full_text,
                "citations": inline_citations,
            })
        except Exception as exc:
            logger.error("Streaming chat failed: %s", exc)
            yield _sse({"event": "error", "message": str(exc)})


def _sse(data: dict) -> str:
    """Format a dict as a Server-Sent Event line."""
    return f"data: {json.dumps(data)}\n\n"


def _persist_ai_message(
    doc_id: str, msg_id: str, text: str, citations: list
) -> None:
    """Save the AI response to DynamoDB after streaming completes."""
    try:
        dynamo_service.create_chat_message(
            doc_id=doc_id,
            user_id="assistant",
            role="assistant",
            text=text,
            citations=citations,
            metadata={"message_id_override": msg_id},
        )
    except Exception as exc:
        logger.error("Failed to persist streamed AI message: %s", exc)


def _load_document_text(doc_id: str) -> str:
    """Load document text from S3 for direct chat context."""
    from app.services import s3_service

    if not doc_id or doc_id == "global":
        return ""
    try:
        doc = dynamo_service.get_document(doc_id)
        if doc and doc.get("s3_key"):
            text = s3_service.extract_text_from_s3_object(doc["s3_key"]) or ""
            logger.info("Loaded %d chars of document text for streaming chat", len(text))
            return text
    except Exception as exc:
        logger.warning("Could not load document text for streaming: %s", exc)
    return ""
