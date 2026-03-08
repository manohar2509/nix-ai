"""
Document routes — matches frontend documentService.js endpoints:
  GET    /upload-url              → getPresignedUrl
  POST   /documents               → registerDocument
  GET    /documents               → listDocuments
  GET    /documents/{doc_id}      → getDocument
  DELETE /documents/{doc_id}      → deleteDocument
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.schemas.documents import (
    DocumentDetailResponse,
    DocumentItem,
    DocumentListResponse,
    PresignedUrlResponse,
    RegisterDocumentRequest,
)
from app.core.auth import CurrentUser, get_current_user
from app.core.exceptions import NixAIException
from app.services import document_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


@router.get("/upload-url", response_model=PresignedUrlResponse)
async def get_upload_url(
    filename: str = Query(..., min_length=1),
    contentType: str = Query("application/pdf"),
    user: CurrentUser = Depends(get_current_user),
):
    """Generate a presigned URL for direct S3 upload."""
    try:
        return document_service.get_presigned_url(user, filename, contentType)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get upload URL failed for %s: %s", filename, exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {str(exc)[:200]}")


@router.post("/documents", response_model=DocumentItem)
async def register_document(
    body: RegisterDocumentRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Register an uploaded document in the metadata database."""
    try:
        return document_service.register_document(user, body.name, body.s3_key, body.size)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Register document failed for %s: %s", body.name, exc)
        raise HTTPException(status_code=500, detail=f"Failed to register document: {str(exc)[:200]}")


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    user: CurrentUser = Depends(get_current_user),
):
    """List all documents for the current user."""
    try:
        docs = document_service.list_documents(user)
        return DocumentListResponse(documents=docs)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("List documents failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(exc)[:200]}")


@router.get("/documents/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get a single document with details and content."""
    try:
        return document_service.get_document(doc_id, user=user)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get document failed for %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get document: {str(exc)[:200]}")


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Delete a document from the system."""
    try:
        return document_service.delete_document(user, doc_id)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Delete document failed for %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(exc)[:200]}")
