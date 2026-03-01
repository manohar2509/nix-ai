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
    """Get Knowledge Base statistics with enhanced detail."""
    docs = dynamo_service.list_kb_documents()
    categories: dict = {}
    total_size = 0
    uploaded_by_admin: dict = {}
    synced_count = 0
    unsynced_count = 0

    for d in docs:
        cat = d.get("category", "general")
        categories[cat] = categories.get(cat, 0) + 1
        total_size += d.get("size", 0)
        admin_id = d.get("uploaded_by", "unknown")
        uploaded_by_admin[admin_id] = uploaded_by_admin.get(admin_id, 0) + 1
        status = d.get("status", "uploaded")
        if status in ("indexed", "uploaded"):
            synced_count += 1
        else:
            unsynced_count += 1

    last_sync_job = _safe_call_fn(dynamo_service.get_last_kb_sync_job, default=None)
    last_sync = None
    sync_status = None
    if last_sync_job:
        last_sync = last_sync_job.get("completed_at") or last_sync_job.get("created_at")
        sync_status = last_sync_job.get("status")

    return {
        "total_documents": len(docs),
        "total_size": total_size,
        "categories": categories,
        "synced_count": synced_count,
        "unsynced_count": unsynced_count,
        "uploaded_by_admin": uploaded_by_admin,
        "last_sync": last_sync,
        "sync_status": sync_status,
    }


# ════════════════════════════════════════════════════════════════
# Duplicate Check
# ════════════════════════════════════════════════════════════════
def check_duplicate(filename: str) -> dict:
    """Check if a filename already exists in the Knowledge Base."""
    docs = dynamo_service.list_kb_documents()
    for d in docs:
        existing_name = d.get("name", "").lower().strip()
        if existing_name == filename.lower().strip():
            return {
                "is_duplicate": True,
                "existing_document": _format_kb_document(d),
                "message": f"A document named '{d.get('name')}' already exists in the Knowledge Base.",
            }
    return {
        "is_duplicate": False,
        "existing_document": None,
        "message": "No duplicate found.",
    }


# ════════════════════════════════════════════════════════════════
# Sanity Check
# ════════════════════════════════════════════════════════════════
SUPPORTED_EXTENSIONS = {"pdf", "json", "txt", "csv", "docx", "doc", "xlsx", "xls", "html", "md"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def run_sanity_check() -> dict:
    """Run comprehensive sanity checks on the entire Knowledge Base."""
    docs = dynamo_service.list_kb_documents()

    duplicates = []
    oversized_files = []
    empty_files = []
    unsupported_types = []
    unsynced_documents = []
    synced_documents = []
    recommendations = []

    # Build name → docs map for duplicate detection
    name_map: dict = {}
    for d in docs:
        name = d.get("name", "").lower().strip()
        name_map.setdefault(name, []).append(d)

    # Check for duplicates
    for name, group in name_map.items():
        if len(group) > 1:
            duplicates.append({
                "filename": name,
                "count": len(group),
                "documents": [
                    {"id": g.get("id"), "name": g.get("name"), "uploaded_by": g.get("uploaded_by", ""), "created_at": g.get("created_at", "")}
                    for g in group
                ],
            })

    for d in docs:
        doc_info = {"id": d.get("id"), "name": d.get("name"), "size": d.get("size", 0), "status": d.get("status", "")}

        # Check file size
        size = d.get("size", 0)
        if size > MAX_FILE_SIZE:
            oversized_files.append(doc_info)
        if size == 0:
            empty_files.append(doc_info)

        # Check extension
        ext = d.get("name", "").rsplit(".", 1)[-1].lower() if "." in d.get("name", "") else ""
        if ext and ext not in SUPPORTED_EXTENSIONS:
            unsupported_types.append({**doc_info, "extension": ext})

        # Check sync status
        status = d.get("status", "uploaded")
        if status in ("unsynced", "error"):
            unsynced_documents.append(doc_info)
        else:
            synced_documents.append(doc_info)

    # Calculate health score
    issues_count = len(duplicates) + len(oversized_files) + len(empty_files) + len(unsupported_types) + len(unsynced_documents)
    total = max(len(docs), 1)
    health_score = max(0, round(100 - (issues_count / total * 50), 1))

    # Generate recommendations
    if duplicates:
        recommendations.append(f"Found {len(duplicates)} duplicate filename(s). Consider removing duplicates to avoid confusion.")
    if empty_files:
        recommendations.append(f"Found {len(empty_files)} empty file(s) (0 bytes). These won't add value to RAG and should be removed.")
    if oversized_files:
        recommendations.append(f"Found {len(oversized_files)} file(s) exceeding 50MB. Large files may slow indexing.")
    if unsupported_types:
        recommendations.append(f"Found {len(unsupported_types)} file(s) with unsupported extensions. These may not be parsed correctly by Bedrock.")
    if unsynced_documents:
        recommendations.append(f"{len(unsynced_documents)} document(s) are not synced. Run Sync to update the Bedrock index.")
    if not docs:
        recommendations.append("Knowledge Base is empty. Upload reference documents to enable RAG-powered chat.")
    if not recommendations:
        recommendations.append("Knowledge Base is healthy! All documents are in good shape.")

    return {
        "total_documents": len(docs),
        "duplicates": duplicates,
        "oversized_files": oversized_files,
        "empty_files": empty_files,
        "unsupported_types": unsupported_types,
        "unsynced_documents": [_format_kb_document_brief(d) for d in docs if d.get("status") in ("unsynced", "error")],
        "synced_documents": [_format_kb_document_brief(d) for d in docs if d.get("status") not in ("unsynced", "error")],
        "issues_count": issues_count,
        "health_score": health_score,
        "recommendations": recommendations,
    }


# ════════════════════════════════════════════════════════════════
# Unsync / Resync
# ════════════════════════════════════════════════════════════════
def unsync_kb_document(kb_doc_id: str) -> dict:
    """Mark a KB document as unsynced so it's excluded from next Bedrock re-index."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    dynamo_service.update_kb_document(kb_doc_id, {"status": "unsynced"})
    logger.info("Unsynced KB document %s", kb_doc_id)
    return {"success": True, "id": kb_doc_id, "status": "unsynced"}


def resync_kb_document(kb_doc_id: str) -> dict:
    """Re-mark a previously unsynced document for indexing."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    dynamo_service.update_kb_document(kb_doc_id, {"status": "uploaded"})
    logger.info("Re-synced KB document %s", kb_doc_id)
    return {"success": True, "id": kb_doc_id, "status": "uploaded"}


# ════════════════════════════════════════════════════════════════
# Bulk Delete
# ════════════════════════════════════════════════════════════════
def bulk_delete_kb_documents(doc_ids: list[str]) -> dict:
    """Delete multiple KB documents at once."""
    deleted = []
    failed = []
    for doc_id in doc_ids:
        try:
            doc = dynamo_service.get_kb_document(doc_id)
            if not doc:
                failed.append({"id": doc_id, "reason": "not found"})
                continue
            s3_key = doc.get("s3_key", "")
            if s3_key:
                try:
                    _delete_from_kb_bucket(s3_key)
                except Exception:
                    pass
            dynamo_service.delete_kb_document(doc_id)
            deleted.append(doc_id)
        except Exception as exc:
            failed.append({"id": doc_id, "reason": str(exc)})
    return {"deleted": deleted, "failed": failed, "deleted_count": len(deleted), "failed_count": len(failed)}


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


def _format_kb_document_brief(doc: dict) -> dict:
    """Brief format for sanity check results."""
    return {
        "id": doc.get("id", ""),
        "name": doc.get("name", ""),
        "size": doc.get("size", 0),
        "status": doc.get("status", "uploaded"),
        "category": doc.get("category", "general"),
    }


def _safe_call_fn(fn, *args, default=None):
    """Call fn and return default on any error."""
    try:
        return fn(*args)
    except Exception as exc:
        logger.error("Safe call to %s failed: %s", fn.__name__, exc)
        return default


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
