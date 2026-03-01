"""
Document routes — matches frontend documentService.js endpoints:
  GET    /upload-url              → getPresignedUrl
  POST   /documents               → registerDocument
  GET    /documents               → listDocuments
  GET    /documents/{doc_id}      → getDocument
  DELETE /documents/{doc_id}      → deleteDocument
"""

from fastapi import APIRouter, Depends, Query

from app.api.schemas.documents import (
    DocumentDetailResponse,
    DocumentItem,
    DocumentListResponse,
    PresignedUrlResponse,
    RegisterDocumentRequest,
)
from app.core.auth import CurrentUser, get_current_user
from app.services import document_service

router = APIRouter(tags=["documents"])


@router.get("/upload-url", response_model=PresignedUrlResponse)
async def get_upload_url(
    filename: str = Query(..., min_length=1),
    contentType: str = Query("application/pdf"),
    user: CurrentUser = Depends(get_current_user),
):
    """Generate a presigned URL for direct S3 upload."""
    return document_service.get_presigned_url(user, filename, contentType)


@router.post("/documents", response_model=DocumentItem)
async def register_document(
    body: RegisterDocumentRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Register an uploaded document in the metadata database."""
    return document_service.register_document(user, body.name, body.s3_key, body.size)


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    user: CurrentUser = Depends(get_current_user),
):
    """List all documents for the current user."""
    docs = document_service.list_documents(user)
    return DocumentListResponse(documents=docs)


@router.get("/documents/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get a single document with details and content."""
    return document_service.get_document(doc_id, user=user)


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Delete a document from the system."""
    return document_service.delete_document(user, doc_id)
