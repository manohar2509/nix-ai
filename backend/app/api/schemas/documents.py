"""Document request / response schemas — matches frontend documentService.js contract."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ── Requests ─────────────────────────────────────────────────────
class RegisterDocumentRequest(BaseModel):
    """POST /documents body."""
    name: str = Field(..., min_length=1, max_length=500)
    s3_key: str = Field(..., min_length=1)
    size: int = Field(0, ge=0, le=50 * 1024 * 1024)  # Max 50MB — matches frontend


# ── Responses ────────────────────────────────────────────────────
class PresignedUrlResponse(BaseModel):
    """GET /upload-url response."""
    url: str
    key: str
    expiration: int


class DocumentItem(BaseModel):
    id: str
    name: str
    s3_key: str = ""
    size: int = 0
    status: str = "uploaded"  # uploaded | analyzing | analyzed | error
    created_at: str = ""
    updated_at: str = ""
    user_id: str = ""
    analysis_id: Optional[str] = None


class DocumentDetailResponse(DocumentItem):
    """GET /documents/:id — includes content + sections."""
    content: Optional[str] = None
    sections: list[dict] = []


class DocumentListResponse(BaseModel):
    documents: list[DocumentItem] = []
