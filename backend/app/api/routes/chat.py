"""
Chat routes — matches frontend chatService.js endpoints:
  POST   /chat                           → sendMessage
  POST   /chat/stream                    → sendMessageStream (SSE)
  GET    /documents/{doc_id}/chat        → getChatHistory
  GET    /chat/{message_id}/citations    → getMessageCitations
  POST   /chat/{message_id}/feedback     → submitFeedback
  DELETE /documents/{doc_id}/chat        → clearChatHistory
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.schemas.chat import (
    ChatFeedbackRequest,
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
)
from app.core.auth import CurrentUser, get_current_user
from app.core.exceptions import NixAIException
from app.services import chat_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatMessageResponse)
async def send_message(
    body: ChatMessageRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Send a question to the AI and get a response with citations."""
    try:
        result = chat_service.send_message(user, body.document_id, body.message)
        return result
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Chat send_message failed for doc %s: %s", body.document_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(exc)[:200]}")


@router.post("/chat/stream")
async def send_message_stream(
    body: ChatMessageRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Stream AI response as Server-Sent Events (SSE).

    Events:
      data: {"event":"start","messageId":"...","userMessageId":"..."}
      data: {"event":"token","text":"chunk..."}
      data: {"event":"done","messageId":"...","fullText":"...","citations":[...]}
      data: {"event":"error","message":"..."}
    """
    try:
        return StreamingResponse(
            chat_service.send_message_stream(user, body.document_id, body.message),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Chat stream failed for doc %s: %s", body.document_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to start chat stream: {str(exc)[:200]}")


@router.get("/documents/{doc_id}/chat", response_model=ChatHistoryResponse)
async def get_chat_history(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get all chat messages for a document."""
    try:
        messages = chat_service.get_history(user, doc_id)
        return ChatHistoryResponse(messages=messages)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get chat history failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get chat history: {str(exc)[:200]}")


@router.get("/chat/{message_id}/citations")
async def get_message_citations(
    message_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get detailed citations for a specific AI response."""
    try:
        citations = chat_service.get_message_citations(user, message_id)
        return {"citations": citations}
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get citations failed for message %s: %s", message_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get citations: {str(exc)[:200]}")


@router.post("/chat/{message_id}/feedback")
async def submit_feedback(
    message_id: str,
    body: ChatFeedbackRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Submit feedback (thumbs up/down) on an AI response."""
    try:
        return chat_service.submit_feedback(user, message_id, body.feedback)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Submit feedback failed for message %s: %s", message_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {str(exc)[:200]}")


@router.delete("/documents/{doc_id}/chat")
async def clear_chat_history(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Clear all chat messages for a document."""
    try:
        return chat_service.clear_history(user, doc_id)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Clear chat history failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to clear chat history: {str(exc)[:200]}")
