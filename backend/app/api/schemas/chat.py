"""Chat request / response schemas — matches frontend chatService.js contract."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ── Requests ─────────────────────────────────────────────────────
class ChatMessageRequest(BaseModel):
    """POST /chat body."""
    document_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=10000)


class ChatFeedbackRequest(BaseModel):
    """POST /chat/:messageId/feedback body."""
    feedback: str = Field(..., pattern="^(positive|negative)$")


# ── Responses ────────────────────────────────────────────────────
class Citation(BaseModel):
    text: str = ""
    source: str = ""
    source_type: Optional[str] = None
    url: Optional[str] = None
    page: Optional[int] = None
    section: Optional[str] = None
    score: Optional[float] = None
    s3_uri: Optional[str] = None


class ChatMessageResponse(BaseModel):
    """Returned from POST /chat."""
    id: str
    text: str
    citations: list[Citation] = []
    kb_grounded: Optional[bool] = None
    grounding_source: Optional[str] = None
    metadata: dict = {}


class ChatHistoryItem(BaseModel):
    id: str
    role: str  # "user" | "assistant"
    text: str
    citations: list[Citation] = []
    kb_grounded: Optional[bool] = None
    grounding_source: Optional[str] = None
    created_at: str = ""


class ChatHistoryResponse(BaseModel):
    messages: list[ChatHistoryItem] = []
