"""
NIX AI — Document Business Logic

Orchestrates document lifecycle: upload → register → analyze → delete.
"""

from __future__ import annotations

import logging

from app.core.auth import CurrentUser
from app.core.exceptions import DocumentNotFoundError
from app.services import dynamo_service, s3_service

logger = logging.getLogger(__name__)


def get_presigned_url(user: CurrentUser, filename: str, content_type: str = "application/pdf") -> dict:
    """Generate a presigned upload URL with user-scoped S3 key."""
    return s3_service.generate_presigned_upload_url(filename, content_type, user_id=user.user_id)


def register_document(user: CurrentUser, name: str, s3_key: str, size: int) -> dict:
    """Register an uploaded document in DynamoDB.

    User documents are PRIVATE — they stay in the uploads bucket only.
    They are NEVER copied to the KB bucket.  The KB bucket is managed
    exclusively by admins via the /kb/* endpoints.
    """
    doc = dynamo_service.create_document(
        user_id=user.user_id,
        name=name,
        s3_key=s3_key,
        size=size,
    )
    return _format_document(doc)


def list_documents(user: CurrentUser) -> list[dict]:
    """List all documents for the authenticated user."""
    docs = dynamo_service.list_documents(user.user_id)
    return [_format_document(d) for d in docs]


def get_document(doc_id: str, user: CurrentUser | None = None) -> dict:
    """Get a single document with details.

    If *user* is provided, verifies the caller owns the document.
    """
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    # Ownership check — prevent IDOR
    if user and doc.get("user_id") != user.user_id:
        raise DocumentNotFoundError(doc_id)

    result = _format_document(doc)

    # Try to load content from S3 (for display in editor)
    # Uses smart reader: PDF → extracted text, text files → raw text
    s3_key = doc.get("s3_key", "")
    if s3_key:
        try:
            content = s3_service.extract_text_from_s3_object(s3_key)
            result["content"] = content
        except Exception:
            result["content"] = None

    return result


def delete_document(user: CurrentUser, doc_id: str) -> dict:
    """Delete a document and all associated resources from DynamoDB and S3."""
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    # Ownership check — prevent IDOR
    if doc.get("user_id") != user.user_id:
        raise DocumentNotFoundError(doc_id)

    # Delete from S3
    s3_key = doc.get("s3_key", "")
    if s3_key:
        try:
            s3_service.delete_object(s3_key)
        except Exception as exc:
            logger.warning("S3 delete failed for %s: %s", s3_key, exc)

    # Cascade delete: analysis records, chat messages for this document
    try:
        dynamo_service.delete_chat_history(doc_id)
    except Exception as exc:
        logger.warning("Chat history cleanup failed for doc %s: %s", doc_id, exc)

    # Delete from DynamoDB
    dynamo_service.delete_document(doc_id)
    return {"success": True, "id": doc_id}


def _format_document(doc: dict) -> dict:
    """Format DynamoDB item → API response."""
    return {
        "id": doc.get("id", ""),
        "name": doc.get("name", ""),
        "s3_key": doc.get("s3_key", ""),
        "size": doc.get("size", 0),
        "status": doc.get("status", "uploaded"),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
        "user_id": doc.get("user_id", ""),
        "analysis_id": doc.get("analysis_id"),
    }
