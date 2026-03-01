"""
NIX AI — Knowledge Base Service (Admin Only)

Manages the curated Knowledge Base document lifecycle:
  Admin uploads reference doc → KB S3 bucket → DynamoDB (KB_DOCUMENT)
  Admin triggers Sync → Bedrock re-indexes → available to all users via RAG

CRITICAL ARCHITECTURE RULE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • User documents  → nixai-clinical-uploads bucket → PRIVATE, per-user
  • KB documents    → nixai-clinical-kb bucket     → SHARED, curated by admins
  • User docs NEVER enter the KB bucket or RAG search results.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.core.auth import CurrentUser
from app.core.exceptions import NixAIException, StorageError
from app.services import dynamo_service, s3_service, sqs_service

logger = logging.getLogger(__name__)


# ── Custom exception ────────────────────────────────────────────
class KBDocumentNotFoundError(NixAIException):
    def __init__(self, doc_id: str):
        super().__init__(f"KB document {doc_id} not found", status_code=404)


# ════════════════════════════════════════════════════════════════
# Upload flow  (presigned URL → S3 → register)
# ════════════════════════════════════════════════════════════════
def get_kb_upload_url(filename: str, content_type: str = "application/pdf") -> dict:
    """
    Generate a presigned PUT URL for the KB bucket (NOT the uploads bucket).

    This ensures the file goes directly to nixai-clinical-kb/documents/,
    never touching the user uploads bucket at all.
    """
    from app.core.aws_clients import get_s3_client
    from app.core.config import get_settings

    settings = get_settings()
    s3 = get_s3_client()
    key = f"documents/{filename}"

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.KB_BUCKET_NAME,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=settings.PRESIGNED_URL_EXPIRY,
        )
        logger.info("Generated KB presigned URL for %s in %s", key, settings.KB_BUCKET_NAME)
        return {
            "url": url,
            "key": key,
            "expiration": settings.PRESIGNED_URL_EXPIRY,
        }
    except Exception as exc:
        logger.error("KB presigned URL generation failed: %s", exc)
        raise StorageError(f"Could not create KB upload link: {exc}")


def register_kb_document(
    user: CurrentUser,
    name: str,
    s3_key: str,
    size: int,
    description: str = "",
    category: str = "general",
) -> dict:
    """
    Register a KB document in DynamoDB after the admin uploads it to the KB bucket.

    The file is already in nixai-clinical-kb (uploaded via presigned URL).
    This just creates the metadata record.
    """
    doc = dynamo_service.create_kb_document(
        uploaded_by=user.user_id,
        name=name,
        s3_key=s3_key,
        size=size,
        description=description,
        category=category,
    )
    logger.info(
        "Admin %s registered KB document: %s (category=%s)",
        user.user_id, name, category,
    )
    return _format_kb_document(doc)


# ════════════════════════════════════════════════════════════════
# Read / List / Delete
# ════════════════════════════════════════════════════════════════
def list_kb_documents() -> list[dict]:
    """List all KB documents (visible to admins for management)."""
    docs = dynamo_service.list_kb_documents()
    return [_format_kb_document(d) for d in docs]


def get_kb_document(kb_doc_id: str) -> dict:
    """Get a single KB document by ID."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    return _format_kb_document(doc)


def delete_kb_document(kb_doc_id: str) -> dict:
    """Delete a KB document from DynamoDB and the KB S3 bucket."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)

    # Delete from KB S3 bucket
    s3_key = doc.get("s3_key", "")
    if s3_key:
        try:
            _delete_from_kb_bucket(s3_key)
        except Exception as exc:
            logger.warning("KB S3 delete failed for %s: %s (non-blocking)", s3_key, exc)

    # Delete from DynamoDB
    dynamo_service.delete_kb_document(kb_doc_id)
    logger.info("Deleted KB document %s (s3_key=%s)", kb_doc_id, s3_key)
    return {"success": True, "id": kb_doc_id}


# ════════════════════════════════════════════════════════════════
# KB Sync  (trigger Bedrock re-indexing)
# ════════════════════════════════════════════════════════════════
def submit_kb_sync(user: CurrentUser) -> dict:
    """
    Submit a Knowledge Base sync job (Admin only).

    Two execution modes:
    ─────────────────────────────────────────────────────
    • Lambda (production):  Creates DynamoDB job → sends SQS message
                            → Worker Lambda picks it up asynchronously.
    • Local dev (uvicorn):  Creates DynamoDB job → executes the KB sync
                            task INLINE (no SQS) → returns with final status.
    ─────────────────────────────────────────────────────

    Deduplication: if a SYNC_KB job is already QUEUED or IN_PROGRESS,
    return the existing job instead of creating a new one.
    """
    from app.core.config import get_settings

    settings = get_settings()

    # ── Check for active sync job first ──
    existing = _find_active_sync_job(user.user_id)
    if existing:
        logger.info(
            "Active SYNC_KB job %s already exists (status=%s), returning it",
            existing["id"],
            existing["status"],
        )
        return {
            "jobId": existing["id"],
            "status": existing["status"],
            "createdAt": existing.get("created_at", ""),
            "deduplicated": True,
        }

    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB",
        params={},
    )

    # ── Decide: SQS (Lambda) or inline (local dev) ──
    if settings.is_lambda:
        sqs_service.send_kb_sync_task(
            job_id=job["id"],
            user_id=user.user_id,
        )
        logger.info("KB sync job %s queued to SQS", job["id"])
        return {
            "jobId": job["id"],
            "status": "QUEUED",
            "createdAt": job["created_at"],
        }
    else:
        logger.info("Running KB sync job %s inline (local dev mode)", job["id"])
        return _execute_kb_sync_inline(job)


# ════════════════════════════════════════════════════════════════
# Stats
# ════════════════════════════════════════════════════════════════
def get_kb_stats() -> dict:
    """Get Knowledge Base statistics."""
    stats = dynamo_service.get_kb_stats()
    return stats


# ════════════════════════════════════════════════════════════════
# Private helpers
# ════════════════════════════════════════════════════════════════
def _format_kb_document(doc: dict) -> dict:
    """Format DynamoDB item → API response."""
    return {
        "id": doc.get("id", ""),
        "name": doc.get("name", ""),
        "s3_key": doc.get("s3_key", ""),
        "size": doc.get("size", 0),
        "description": doc.get("description", ""),
        "category": doc.get("category", "general"),
        "status": doc.get("status", "uploaded"),
        "uploaded_by": doc.get("uploaded_by", ""),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


def _delete_from_kb_bucket(key: str) -> None:
    """Delete a file from the KB S3 bucket."""
    from app.core.aws_clients import get_s3_client
    from app.core.config import get_settings

    settings = get_settings()
    s3 = get_s3_client()
    s3.delete_object(Bucket=settings.KB_BUCKET_NAME, Key=key)
    logger.info("Deleted from KB bucket: s3://%s/%s", settings.KB_BUCKET_NAME, key)


def _execute_kb_sync_inline(job: dict) -> dict:
    """
    Execute the KB sync task directly in the API process.
    Used in local dev where there is no SQS → Lambda worker.
    """
    job_id = job["id"]
    try:
        from worker.tasks.kb_sync import process_kb_sync

        process_kb_sync({"job_id": job_id, "user_id": job.get("user_id", "")})

        updated = dynamo_service.get_job(job_id)
        final_status = updated.get("status", "COMPLETE") if updated else "COMPLETE"

        return {
            "jobId": job_id,
            "status": final_status,
            "createdAt": job.get("created_at", ""),
            "inline": True,
        }
    except Exception as exc:
        logger.error("Inline KB sync failed for job %s: %s", job_id, exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        return {
            "jobId": job_id,
            "status": "FAILED",
            "createdAt": job.get("created_at", ""),
            "error": str(exc),
            "inline": True,
        }


def _find_active_sync_job(user_id: str):
    """
    Check if there is already a QUEUED or IN_PROGRESS SYNC_KB job.
    Returns the job dict or None.

    A QUEUED job older than 2 minutes is considered stale and is
    auto-marked FAILED so it won't block new sync requests.
    """
    now = datetime.now(timezone.utc)
    stale_threshold = 120  # 2 minutes

    recent_jobs = dynamo_service.list_jobs(user_id, limit=20)
    for job in recent_jobs:
        if job.get("type") != "SYNC_KB":
            continue
        if job.get("status") not in ("QUEUED", "IN_PROGRESS"):
            continue

        created_str = job.get("created_at", "")
        if created_str:
            try:
                created_at = datetime.fromisoformat(created_str)
                age_seconds = (now - created_at).total_seconds()
                if age_seconds > stale_threshold:
                    logger.warning(
                        "Stale SYNC_KB job %s (age=%ds), marking FAILED",
                        job["id"],
                        age_seconds,
                    )
                    dynamo_service.update_job(job["id"], {
                        "status": "FAILED",
                        "error": "Stale — worker never picked up the job",
                    })
                    continue
            except (ValueError, TypeError):
                pass

        return job

    return None
