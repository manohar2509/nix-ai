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


class UpdateKBDocumentRequest(BaseModel):
    """Patch editable KB metadata fields."""
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(
        None,
        pattern="^(regulatory|template|guideline|reference|general)$",
    )


class ReplaceKBDocumentRequest(BaseModel):
    """Replace an existing KB file after uploading new bytes to S3."""
    s3_key: str = Field(..., min_length=1)
    size: int = Field(..., ge=0)
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    change_note: str = Field("", max_length=2000)


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
    status: str = "sync_pending"  # sync_pending | indexed | unsynced | error | deleted
    uploaded_by: str = ""
    bedrock_sync_pending: bool = False
    current_version: int = 1
    versions: list[dict] = []
    last_synced_at: Optional[str] = None
    last_sync_job_id: Optional[str] = None
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
    category: Optional[str] = None
    onlyChanged: bool = False
    error: Optional[str] = None


class KBDuplicateCheckResponse(BaseModel):
    """Result of a duplicate check for a filename."""
    is_duplicate: bool = False
    existing_document: Optional[KBDocumentItem] = None
    message: str = ""


class KBSanityCheckResponse(BaseModel):
    """Sanity check results for the entire Knowledge Base."""
    total_documents: int = 0
    duplicates: list[dict] = []
    oversized_files: list[dict] = []
    empty_files: list[dict] = []
    unsupported_types: list[dict] = []
    missing_in_s3: list[dict] = []
    size_mismatches: list[dict] = []
    failed_ingestions: list[dict] = []
    unsynced_documents: list[dict] = []
    synced_documents: list[dict] = []
    issues_count: int = 0
    health_score: float = 100.0
    recommendations: list[str] = []


class KBStatsResponse(BaseModel):
    """Knowledge Base statistics."""
    total_documents: int = 0
    total_size: int = 0
    last_sync: Optional[str] = None
    sync_status: Optional[str] = None
    categories: dict = {}
    synced_count: int = 0
    unsynced_count: int = 0
    ingestion_failures: int = 0
    uploaded_by_admin: dict = {}


class KBDocumentHistoryResponse(BaseModel):
    """KB document immutable change history."""
    history: list[dict] = []


class KBIngestionListResponse(BaseModel):
    """Tracked Bedrock ingestion jobs for KB sync operations."""
    ingestions: list[dict] = []


class KBReconcileResponse(BaseModel):
    """Result of reconciling S3 bucket with DynamoDB metadata."""
    imported: list[dict] = []
    skipped: list[dict] = []
    errors: list[dict] = []
    imported_count: int = 0
    skipped_count: int = 0
    error_count: int = 0
    total_s3_objects: int = 0
