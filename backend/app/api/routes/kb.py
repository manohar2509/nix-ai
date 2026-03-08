"""
Knowledge Base routes — Admin-only KB document management.

All endpoints require admin authentication (require_admin dependency).

  GET    /kb/upload-url           → getKBUploadUrl
  POST   /kb/documents            → registerKBDocument
  GET    /kb/documents            → listKBDocuments
  GET    /kb/documents/{id}       → getKBDocument
  DELETE /kb/documents/{id}       → deleteKBDocument
  POST   /kb/sync                 → syncKnowledgeBase
  GET    /kb/stats                → getKBStats

ARCHITECTURE:
  KB documents go to nixai-clinical-kb bucket → Bedrock indexes → RAG for all users.
  User documents go to nixai-clinical-uploads bucket → PRIVATE, never in RAG.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.schemas.kb import (
    KBDocumentItem,
    KBDocumentHistoryResponse,
    KBDocumentListResponse,
    KBDuplicateCheckResponse,
    KBIngestionListResponse,
    KBPresignedUrlResponse,
    KBReconcileResponse,
    KBSanityCheckResponse,
    KBStatsResponse,
    KBSyncResponse,
    ReplaceKBDocumentRequest,
    RegisterKBDocumentRequest,
    UpdateKBDocumentRequest,
)
from app.core.auth import CurrentUser, require_admin
from app.services import kb_service

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


@router.get("/upload-url", response_model=KBPresignedUrlResponse)
async def get_kb_upload_url(
    filename: str = Query(..., min_length=1),
    contentType: str = Query("application/pdf"),
    user: CurrentUser = Depends(require_admin),
):
    """Generate a presigned URL for direct upload to the KB S3 bucket.

    This URL points to nixai-clinical-kb/documents/ — NOT the user uploads bucket.
    Only admins can upload to the Knowledge Base.
    """
    return kb_service.get_kb_upload_url(filename, contentType)


@router.post("/documents", response_model=KBDocumentItem)
async def register_kb_document(
    body: RegisterKBDocumentRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Register a document that was uploaded to the KB bucket.

    Called after the presigned URL upload completes.
    Creates a KB_DOCUMENT record in DynamoDB (separate from user documents).
    """
    return kb_service.register_kb_document(
        user=user,
        name=body.name,
        s3_key=body.s3_key,
        size=body.size,
        description=body.description,
        category=body.category,
    )


@router.get("/documents", response_model=KBDocumentListResponse)
async def list_kb_documents(
    user: CurrentUser = Depends(require_admin),
):
    """List all documents in the Knowledge Base.

    Returns KB_DOCUMENT entities only — not user trial documents.
    """
    docs = kb_service.list_kb_documents()
    return KBDocumentListResponse(documents=docs, total=len(docs))


@router.get("/documents/{kb_doc_id}", response_model=KBDocumentItem)
async def get_kb_document(
    kb_doc_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Get a single KB document by ID."""
    return kb_service.get_kb_document(kb_doc_id)


@router.delete("/documents/{kb_doc_id}")
async def delete_kb_document(
    kb_doc_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Delete a KB document from DynamoDB and the KB S3 bucket.

    After deletion, run Sync to remove it from Bedrock's index.
    """
    return kb_service.delete_kb_document(kb_doc_id, user)


@router.put("/documents/{kb_doc_id}", response_model=KBDocumentItem)
async def update_kb_document(
    kb_doc_id: str,
    body: UpdateKBDocumentRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Update KB document metadata (name / description / category)."""
    return kb_service.update_kb_document_metadata(
        kb_doc_id=kb_doc_id,
        user=user,
        name=body.name,
        description=body.description,
        category=body.category,
    )


@router.post("/documents/{kb_doc_id}/replace", response_model=KBDocumentItem)
async def replace_kb_document(
    kb_doc_id: str,
    body: ReplaceKBDocumentRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Replace a KB document's source file after uploading new bytes to S3."""
    return kb_service.replace_kb_document_file(
        kb_doc_id=kb_doc_id,
        user=user,
        s3_key=body.s3_key,
        size=body.size,
        name=body.name,
        change_note=body.change_note,
    )


@router.get("/documents/{kb_doc_id}/history", response_model=KBDocumentHistoryResponse)
async def get_kb_document_history(
    kb_doc_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(require_admin),
):
    """Get immutable change history for one KB document."""
    return {"history": kb_service.get_kb_document_history(kb_doc_id, limit=limit)}


@router.post("/sync", response_model=KBSyncResponse)
async def sync_knowledge_base(
    category: str | None = Query(None, pattern="^(regulatory|template|guideline|reference|general)$"),
    onlyChanged: bool = Query(False),
    user: CurrentUser = Depends(require_admin),
):
    """Trigger Bedrock to re-index the KB bucket.

    This should be called after uploading or deleting KB documents
    so Bedrock's vector store stays in sync.
    """
    return kb_service.submit_kb_sync(user, category=category, only_changed=onlyChanged)


@router.get("/stats", response_model=KBStatsResponse)
async def get_kb_stats(
    user: CurrentUser = Depends(require_admin),
):
    """Get Knowledge Base statistics (doc count, categories, etc.)."""
    return kb_service.get_kb_stats()


@router.get("/duplicate-check", response_model=KBDuplicateCheckResponse)
async def check_duplicate(
    filename: str = Query(..., min_length=1),
    user: CurrentUser = Depends(require_admin),
):
    """Check if a filename already exists in the Knowledge Base."""
    return kb_service.check_duplicate(filename)


@router.get("/sanity-check", response_model=KBSanityCheckResponse)
async def run_sanity_check(
    user: CurrentUser = Depends(require_admin),
):
    """Run comprehensive sanity checks on the entire Knowledge Base.

    Checks for: duplicates, empty files, oversized files, unsupported types,
    unsynced documents, and generates a health score with recommendations.
    """
    return kb_service.run_sanity_check()


@router.post("/reconcile", response_model=KBReconcileResponse)
async def reconcile_s3_documents(
    user: CurrentUser = Depends(require_admin),
):
    """Reconcile S3 bucket with DynamoDB — import any unregistered files.

    Scans the KB S3 bucket for files that exist in S3 but have no
    corresponding DynamoDB metadata record. Automatically registers
    them with category inferred from YAML frontmatter or filename.

    Use this after uploading files via CLI, build scripts, or any
    method outside the UI's presigned-URL flow.
    """
    return kb_service.reconcile_s3_documents(user)


@router.post("/documents/{kb_doc_id}/unsync")
async def unsync_kb_document(
    kb_doc_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Mark a KB document as unsynced (will be excluded on next sync).

    The document remains in DynamoDB but its status is set to 'unsynced'.
    On next Bedrock re-index, it will not be included.
    """
    return kb_service.unsync_kb_document(kb_doc_id)


@router.post("/documents/{kb_doc_id}/resync")
async def resync_kb_document(
    kb_doc_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Re-mark a previously unsynced KB document for indexing."""
    return kb_service.resync_kb_document(kb_doc_id)


@router.post("/bulk-delete")
async def bulk_delete_kb_documents(
    body: dict,
    user: CurrentUser = Depends(require_admin),
):
    """Delete multiple KB documents at once."""
    doc_ids = body.get("document_ids", [])
    if not doc_ids or not isinstance(doc_ids, list):
        raise HTTPException(status_code=400, detail="document_ids must be a non-empty list")
    if len(doc_ids) > 50:
        raise HTTPException(status_code=400, detail="Cannot delete more than 50 documents at once")
    return kb_service.bulk_delete_kb_documents(doc_ids, user)


@router.get("/ingestions", response_model=KBIngestionListResponse)
async def list_kb_ingestions(
    syncJobId: str | None = Query(None),
    user: CurrentUser = Depends(require_admin),
):
    """List tracked Bedrock ingestion jobs for KB sync observability."""
    return {"ingestions": kb_service.list_kb_ingestions(sync_job_id=syncJobId)}
