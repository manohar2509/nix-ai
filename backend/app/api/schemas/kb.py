"""
Knowledge Base request / response schemas — Admin-only KB document management.

KB documents are curated reference materials (regulatory guidelines, templates, etc.)
that are indexed into the Bedrock Knowledge Base and made searchable to ALL users via RAG.

These are completely separate from user-uploaded trial documents.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ── Requests ────────────────────────────────────────────────────
class RegisterKBDocumentRequest(BaseModel):
    """Register a document that was uploaded to the KB bucket."""
    name: str = Field(..., min_length=1, max_length=500)
    s3_key: str = Field(..., min_length=1)
    size: int = Field(0, ge=0)
    description: str = Field("", max_length=2000)
    category: str = Field(
        "general",
        pattern="^(regulatory|template|guideline|reference|general)$",
    )


# ── Responses ───────────────────────────────────────────────────
class KBPresignedUrlResponse(BaseModel):
    """Presigned URL pointing to the KB bucket (NOT the user uploads bucket)."""
    url: str
    key: str
    expiration: int


class KBDocumentItem(BaseModel):
    """A single KB document (admin-curated reference material)."""
    id: str
    name: str
    s3_key: str = ""
    size: int = 0
    description: str = ""
    category: str = "general"
    status: str = "uploaded"  # uploaded | indexed | error
    uploaded_by: str = ""
    created_at: str = ""
    updated_at: str = ""


class KBDocumentListResponse(BaseModel):
    """List of all KB documents."""
    documents: list[KBDocumentItem] = []
    total: int = 0


class KBSyncResponse(BaseModel):
    """Response from triggering a KB sync job."""
    jobId: str
    status: str = "QUEUED"
    createdAt: str = ""
    deduplicated: bool = False
    inline: bool = False
    error: Optional[str] = None


class KBStatsResponse(BaseModel):
    """Knowledge Base statistics."""
    total_documents: int = 0
    total_size: int = 0
    last_sync: Optional[str] = None
    sync_status: Optional[str] = None
    categories: dict = {}
