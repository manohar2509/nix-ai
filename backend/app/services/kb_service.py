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
from typing import Optional

from app.core.auth import CurrentUser
from app.core.exceptions import NixAIException, StorageError
from app.services import dynamo_service, sqs_service

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


def update_kb_document_metadata(
    kb_doc_id: str,
    user: CurrentUser,
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
) -> dict:
    """Update editable KB metadata without deleting/re-uploading the document."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc or doc.get("status") == "deleted":
        raise KBDocumentNotFoundError(kb_doc_id)

    updates: dict = {}
    if name is not None and name.strip() and name.strip() != doc.get("name", ""):
        dup = check_duplicate(name)
        existing = dup.get("existing_document")
        if dup["is_duplicate"] and existing and existing.get("id") != kb_doc_id:
            raise NixAIException(f"A KB document named '{name}' already exists", status_code=409)
        updates["name"] = name.strip()

    if description is not None and description != doc.get("description", ""):
        updates["description"] = description

    if category is not None and category != doc.get("category", "general"):
        updates["category"] = category
        updates["bedrock_sync_pending"] = True
        updates["status"] = "sync_pending"

    if not updates:
        return _format_kb_document(doc)

    updated = dynamo_service.update_kb_document(kb_doc_id, updates)
    dynamo_service.create_kb_change_record(
        kb_doc_id=kb_doc_id,
        changed_by=user.user_id,
        change_type="METADATA_UPDATED",
        details={"updates": updates},
    )
    logger.info("Updated KB metadata for %s by admin %s", kb_doc_id, user.user_id)
    return _format_kb_document(updated)


def replace_kb_document_file(
    kb_doc_id: str,
    user: CurrentUser,
    s3_key: str,
    size: int,
    name: Optional[str] = None,
    change_note: str = "",
) -> dict:
    """Replace the source file for an existing KB document and append a new version entry.

    IMPORTANT: Deletes the old S3 object to prevent orphaned files in the
    Bedrock index. Without this, replaced files would create duplicate
    content because Bedrock indexes everything in S3.
    """
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc or doc.get("status") == "deleted":
        raise KBDocumentNotFoundError(kb_doc_id)

    new_name = (name or doc.get("name", "")).strip() or doc.get("name", "")
    if new_name.lower() != doc.get("name", "").lower():
        dup = check_duplicate(new_name)
        existing = dup.get("existing_document")
        if dup["is_duplicate"] and existing and existing.get("id") != kb_doc_id:
            raise NixAIException(f"A KB document named '{new_name}' already exists", status_code=409)

    # Delete the OLD S3 object to prevent orphaned duplicates in Bedrock index
    old_s3_key = doc.get("s3_key", "")
    if old_s3_key and old_s3_key != s3_key:
        try:
            _delete_from_kb_bucket(old_s3_key)
            logger.info("Deleted old KB file %s before replacement", old_s3_key)
        except Exception as exc:
            logger.warning("Failed to delete old KB file %s (non-blocking): %s", old_s3_key, exc)

    current_version = int(doc.get("current_version", 1))
    next_version = current_version + 1
    now = datetime.now(timezone.utc).isoformat()
    versions = list(doc.get("versions", []))
    versions.append({
        "version": next_version,
        "name": new_name,
        "s3_key": s3_key,
        "size": size,
        "hash": dynamo_service._content_hash_for_version(new_name, s3_key, size),
        "changed_by": user.user_id,
        "change_note": change_note or "File replaced",
        "created_at": now,
    })

    updates = {
        "name": new_name,
        "s3_key": s3_key,
        "size": size,
        "current_version": next_version,
        "versions": versions,
        "bedrock_sync_pending": True,
        "status": "sync_pending",
    }
    updated = dynamo_service.update_kb_document(kb_doc_id, updates)
    dynamo_service.create_kb_change_record(
        kb_doc_id=kb_doc_id,
        changed_by=user.user_id,
        change_type="FILE_REPLACED",
        details={
            "from_version": current_version,
            "to_version": next_version,
            "old_s3_key": doc.get("s3_key", ""),
            "new_s3_key": s3_key,
            "size": size,
            "note": change_note,
        },
    )
    logger.info("Replaced KB file for %s to version v%s", kb_doc_id, next_version)
    return _format_kb_document(updated)


def get_kb_document_history(kb_doc_id: str, limit: int = 100) -> list[dict]:
    """Get immutable change history for one KB document."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    return dynamo_service.list_kb_change_records(kb_doc_id, limit=limit)


# ════════════════════════════════════════════════════════════════
# Read / List / Delete
# ════════════════════════════════════════════════════════════════
def list_kb_documents() -> list[dict]:
    """List all KB documents (visible to admins for management)."""
    docs = dynamo_service.list_kb_documents(include_deleted=False)
    return [_format_kb_document(d) for d in docs]


def get_kb_document(kb_doc_id: str) -> dict:
    """Get a single KB document by ID."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    return _format_kb_document(doc)


def delete_kb_document(kb_doc_id: str, user: CurrentUser) -> dict:
    """Delete a KB document and automatically propagate deletion to Bedrock."""
    from app.core.config import get_settings

    settings = get_settings()
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc or doc.get("status") == "deleted":
        raise KBDocumentNotFoundError(kb_doc_id)

    # Delete source object first (best-effort)
    s3_key = doc.get("s3_key", "")
    if s3_key:
        try:
            _delete_from_kb_bucket(s3_key)
        except Exception as exc:
            logger.warning("KB S3 delete failed for %s: %s (non-blocking)", s3_key, exc)

    # Soft-delete + audit first, hard-delete only after successful sync
    dynamo_service.update_kb_document(kb_doc_id, {
        "status": "deleted",
        "bedrock_sync_pending": True,
    })
    dynamo_service.create_kb_change_record(
        kb_doc_id=kb_doc_id,
        changed_by=user.user_id,
        change_type="DELETED",
        details={"s3_key": s3_key},
    )

    sync_payload = {
        "category": None,
        "only_changed": False,
        "purge_deleted": True,
        "deleted_doc_id": kb_doc_id,
    }
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB_DELETE",
        params=sync_payload,
    )

    if settings.is_lambda:
        sqs_service.send_kb_sync_task(
            job_id=job["id"],
            user_id=user.user_id,
            sync_params=sync_payload,
        )
    else:
        _execute_kb_sync_inline(job, sync_payload)

    logger.info("Deleted KB document %s and queued Bedrock purge via job %s", kb_doc_id, job["id"])
    return {"success": True, "id": kb_doc_id, "syncJobId": job["id"]}


# ════════════════════════════════════════════════════════════════
# KB Sync  (trigger Bedrock re-indexing)
# ════════════════════════════════════════════════════════════════
def submit_kb_sync(
    user: CurrentUser,
    category: str | None = None,
    only_changed: bool = False,
) -> dict:
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

    sync_params = {
        "category": category,
        "only_changed": only_changed,
        "purge_deleted": False,
    }

    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB",
        params=sync_params,
    )

    # ── Decide: SQS (Lambda) or inline (local dev) ──
    if settings.is_lambda:
        sqs_service.send_kb_sync_task(
            job_id=job["id"],
            user_id=user.user_id,
            sync_params=sync_params,
        )
        logger.info("KB sync job %s queued to SQS", job["id"])
        return {
            "jobId": job["id"],
            "status": "QUEUED",
            "createdAt": job["created_at"],
            "category": category,
            "onlyChanged": only_changed,
        }
    else:
        logger.info("Running KB sync job %s inline (local dev mode)", job["id"])
        return _execute_kb_sync_inline(job, sync_params)


# ════════════════════════════════════════════════════════════════
# Stats
# ════════════════════════════════════════════════════════════════
def get_kb_stats() -> dict:
    """Get Knowledge Base statistics with enhanced detail."""
    docs = dynamo_service.list_kb_documents(include_deleted=False)
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
        status = d.get("status", "sync_pending")
        if status in ("indexed",):
            synced_count += 1
        else:
            unsynced_count += 1

    ingestion_failures = 0
    all_ingestions = _safe_call_fn(dynamo_service.scan_all_entities, "KB_INGESTION", default=[]) or []
    if all_ingestions:
        ingestion_failures = sum(1 for i in all_ingestions if i.get("status") in ("FAILED", "STOPPED"))

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
        "ingestion_failures": ingestion_failures,
    }


# ════════════════════════════════════════════════════════════════
# Duplicate Check
# ════════════════════════════════════════════════════════════════
def check_duplicate(filename: str) -> dict:
    """Check if a filename already exists in the Knowledge Base."""
    docs = dynamo_service.list_kb_documents(include_deleted=False)
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
    from app.core.aws_clients import get_s3_client
    from app.core.config import get_settings

    settings = get_settings()
    s3 = get_s3_client()
    docs = dynamo_service.list_kb_documents(include_deleted=False)

    duplicates = []
    oversized_files = []
    empty_files = []
    unsupported_types = []
    unsynced_documents = []
    synced_documents = []
    missing_in_s3 = []
    size_mismatches = []
    failed_ingestions = []
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
        status = d.get("status", "sync_pending")
        if status in ("unsynced", "error", "sync_pending"):
            unsynced_documents.append(doc_info)
        else:
            synced_documents.append(doc_info)

        # Check S3 existence and content length consistency
        s3_key = d.get("s3_key", "")
        if s3_key:
            try:
                head = s3.head_object(Bucket=settings.KB_BUCKET_NAME, Key=s3_key)
                remote_size = int(head.get("ContentLength", 0))
                if remote_size != size:
                    size_mismatches.append({
                        **doc_info,
                        "s3_key": s3_key,
                        "expected_size": size,
                        "actual_size": remote_size,
                    })
            except Exception:
                missing_in_s3.append({
                    **doc_info,
                    "s3_key": s3_key,
                })

    ingestion_rows = _safe_call_fn(dynamo_service.scan_all_entities, "KB_INGESTION", default=[]) or []
    for row in ingestion_rows:
        if row.get("status") in ("FAILED", "STOPPED"):
            failed_ingestions.append({
                "ingestion_job_id": row.get("ingestion_job_id", ""),
                "sync_job_id": row.get("sync_job_id", ""),
                "data_source_id": row.get("data_source_id", ""),
                "error": row.get("error", ""),
            })

    # Calculate health score
    issues_count = (
        len(duplicates)
        + len(oversized_files)
        + len(empty_files)
        + len(unsupported_types)
        + len(unsynced_documents)
        + len(missing_in_s3)
        + len(size_mismatches)
        + len(failed_ingestions)
    )
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
    if missing_in_s3:
        recommendations.append(f"Found {len(missing_in_s3)} KB metadata record(s) missing in S3. Re-upload or delete stale metadata.")
    if size_mismatches:
        recommendations.append(f"Found {len(size_mismatches)} KB file(s) where S3 size differs from metadata. Verify source and resync.")
    if failed_ingestions:
        recommendations.append(f"Detected {len(failed_ingestions)} failed Bedrock ingestion job(s). Retry sync after fixing source issues.")
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
        "missing_in_s3": missing_in_s3,
        "size_mismatches": size_mismatches,
        "failed_ingestions": failed_ingestions,
        "unsynced_documents": [_format_kb_document_brief(d) for d in docs if d.get("status") in ("unsynced", "error", "sync_pending")],
        "synced_documents": [_format_kb_document_brief(d) for d in docs if d.get("status") == "indexed"],
        "issues_count": issues_count,
        "health_score": health_score,
        "recommendations": recommendations,
    }


# ════════════════════════════════════════════════════════════════
# Unsync / Resync
# ════════════════════════════════════════════════════════════════
def unsync_kb_document(kb_doc_id: str) -> dict:
    """Mark a KB document as unsynced AND move its S3 file out of the indexed prefix.

    Simply setting DynamoDB status to 'unsynced' is NOT enough — Bedrock indexes
    everything in S3 regardless of our metadata. We must physically move the file
    to an 'unsynced/' prefix so Bedrock's next crawl won't pick it up.
    """
    from app.core.aws_clients import get_s3_client
    from app.core.config import get_settings

    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)

    settings = get_settings()
    s3 = get_s3_client()
    original_key = doc.get("s3_key", "")

    # Move from documents/ → unsynced/ so Bedrock stops indexing it
    if original_key and original_key.startswith("documents/"):
        unsynced_key = original_key.replace("documents/", "unsynced/", 1)
        try:
            s3.copy_object(
                CopySource={"Bucket": settings.KB_BUCKET_NAME, "Key": original_key},
                Bucket=settings.KB_BUCKET_NAME,
                Key=unsynced_key,
            )
            s3.delete_object(Bucket=settings.KB_BUCKET_NAME, Key=original_key)
            logger.info("Moved KB file %s → %s for unsync", original_key, unsynced_key)
        except Exception as exc:
            logger.warning("Failed to move KB file for unsync (non-blocking): %s", exc)

    # Update s3_key to reflect the new location so other reads don't 404
    new_key = original_key.replace("documents/", "unsynced/", 1) if original_key.startswith("documents/") else original_key
    dynamo_service.update_kb_document(kb_doc_id, {
        "status": "unsynced",
        "bedrock_sync_pending": False,
        "s3_key": new_key,
        "original_s3_key": original_key,  # preserve for resync
    })
    logger.info("Unsynced KB document %s", kb_doc_id)
    return {"success": True, "id": kb_doc_id, "status": "unsynced"}


def resync_kb_document(kb_doc_id: str) -> dict:
    """Re-mark a previously unsynced document for indexing and move its S3 file back."""
    from app.core.aws_clients import get_s3_client
    from app.core.config import get_settings

    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)

    settings = get_settings()
    s3 = get_s3_client()
    original_key = doc.get("original_s3_key") or doc.get("s3_key", "")

    # Move from unsynced/ → documents/ so Bedrock can index it again
    if original_key and original_key.startswith("documents/"):
        unsynced_key = original_key.replace("documents/", "unsynced/", 1)
        try:
            s3.copy_object(
                CopySource={"Bucket": settings.KB_BUCKET_NAME, "Key": unsynced_key},
                Bucket=settings.KB_BUCKET_NAME,
                Key=original_key,
            )
            s3.delete_object(Bucket=settings.KB_BUCKET_NAME, Key=unsynced_key)
            logger.info("Moved KB file %s → %s for resync", unsynced_key, original_key)
        except Exception as exc:
            logger.warning("Failed to move KB file for resync (non-blocking): %s", exc)

    dynamo_service.update_kb_document(kb_doc_id, {
        "status": "sync_pending",
        "bedrock_sync_pending": True,
        "s3_key": original_key,
    })
    logger.info("Re-synced KB document %s", kb_doc_id)
    return {"success": True, "id": kb_doc_id, "status": "sync_pending"}


# ════════════════════════════════════════════════════════════════
# Bulk Delete
# ════════════════════════════════════════════════════════════════
def bulk_delete_kb_documents(doc_ids: list[str], user: CurrentUser) -> dict:
    """Delete multiple KB documents at once."""
    deleted = []
    failed = []
    sync_job_ids = []
    for doc_id in doc_ids:
        try:
            result = delete_kb_document(doc_id, user)
            deleted.append(doc_id)
            if result.get("syncJobId"):
                sync_job_ids.append(result["syncJobId"])
        except Exception as exc:
            failed.append({"id": doc_id, "reason": str(exc)})
    return {
        "deleted": deleted,
        "failed": failed,
        "deleted_count": len(deleted),
        "failed_count": len(failed),
        "sync_job_ids": sync_job_ids,
    }


def list_kb_ingestions(sync_job_id: Optional[str] = None) -> list[dict]:
    """List ingestion records globally or for one sync job."""
    if sync_job_id:
        return dynamo_service.list_kb_ingestions_for_job(sync_job_id)
    all_rows = _safe_call_fn(dynamo_service.scan_all_entities, "KB_INGESTION", default=[]) or []
    return sorted(all_rows, key=lambda x: x.get("created_at", ""), reverse=True)


# ════════════════════════════════════════════════════════════════
# Reconcile S3 ↔ DynamoDB  (import unregistered S3 files)
# ════════════════════════════════════════════════════════════════

# Filename → category mapping for auto-import of known KB reference files
_FILENAME_CATEGORY_MAP = {
    "01_ich_guidelines": "regulatory",
    "02_fda_guidance": "regulatory",
    "03_hta_requirements": "guideline",
    "04_clinical_standards": "guideline",
    "05_therapeutic_benchmarks": "reference",
    "06_payer_frameworks": "reference",
    "07_ema_guidelines": "regulatory",
    "08_citation_database": "reference",
    "09_regional_regulatory": "regulatory",
    "10_fda_cfr_regulations": "regulatory",
    "11_gcp_compliance_checklist": "guideline",
}


def _infer_category_from_s3_object(s3_client, bucket: str, key: str) -> str:
    """Try to infer category from YAML frontmatter or filename pattern."""
    # First try reading YAML frontmatter (for .md files)
    if key.endswith(".md"):
        try:
            resp = s3_client.get_object(Bucket=bucket, Key=key, Range="bytes=0-1024")
            head = resp["Body"].read().decode("utf-8", errors="ignore")
            if head.startswith("---"):
                end = head.find("---", 3)
                if end > 0:
                    frontmatter = head[3:end]
                    for line in frontmatter.splitlines():
                        if line.strip().startswith("category:"):
                            cat = line.split(":", 1)[1].strip()
                            if cat in ("regulatory", "guideline", "template", "reference", "general"):
                                return cat
        except Exception:
            pass

    # Fallback: match filename stem against known mapping
    filename = key.rsplit("/", 1)[-1]
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    for pattern, cat in _FILENAME_CATEGORY_MAP.items():
        if pattern in stem:
            return cat

    return "general"


def reconcile_s3_documents(user: CurrentUser) -> dict:
    """Scan the KB S3 bucket and register any files not tracked in DynamoDB.

    This bridges the gap when files are uploaded to S3 outside the UI
    (e.g. via CLI, build scripts, or infrastructure automation).

    Steps:
      1. List all objects under documents/ in the KB bucket
      2. Get all existing KB_DOCUMENT records from DynamoDB
      3. For each S3 object without a matching DynamoDB record → register it
      4. Return a summary of what was imported
    """
    from app.core.aws_clients import get_s3_client
    from app.core.config import get_settings

    settings = get_settings()
    s3 = get_s3_client()

    # 1. List all S3 objects under documents/
    s3_objects = {}
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.KB_BUCKET_NAME, Prefix="documents/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            # Skip the prefix itself or zero-byte "folder" markers
            if key == "documents/" or obj["Size"] == 0:
                continue
            s3_objects[key] = obj

    # 2. Get all existing DynamoDB KB_DOCUMENT records (incl. deleted for dedup safety)
    existing_docs = dynamo_service.list_kb_documents(include_deleted=True)
    registered_keys = {d.get("s3_key", "") for d in existing_docs}

    # 3. Identify unregistered files
    imported = []
    skipped = []
    errors = []

    for s3_key, obj in s3_objects.items():
        if s3_key in registered_keys:
            skipped.append({"s3_key": s3_key, "reason": "already registered"})
            continue

        filename = s3_key.rsplit("/", 1)[-1]
        size = int(obj.get("Size", 0))
        category = _infer_category_from_s3_object(s3, settings.KB_BUCKET_NAME, s3_key)

        # Build description from filename
        stem = filename.rsplit(".", 1)[0] if "." in filename else filename
        description = f"Auto-imported from S3: {stem}"

        try:
            doc = dynamo_service.create_kb_document(
                uploaded_by=user.user_id,
                name=filename,
                s3_key=s3_key,
                size=size,
                description=description,
                category=category,
            )
            imported.append({
                "id": doc.get("id", ""),
                "name": filename,
                "s3_key": s3_key,
                "size": size,
                "category": category,
            })
            logger.info("Reconcile: imported %s (category=%s)", s3_key, category)
        except Exception as exc:
            errors.append({"s3_key": s3_key, "error": str(exc)})
            logger.error("Reconcile: failed to import %s: %s", s3_key, exc)

    logger.info(
        "KB reconciliation complete: %d imported, %d skipped, %d errors",
        len(imported), len(skipped), len(errors),
    )
    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "total_s3_objects": len(s3_objects),
    }


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
        "status": doc.get("status", "sync_pending"),
        "uploaded_by": doc.get("uploaded_by", ""),
        "bedrock_sync_pending": bool(doc.get("bedrock_sync_pending", False)),
        "current_version": int(doc.get("current_version", 1)),
        "versions": doc.get("versions", []),
        "last_synced_at": doc.get("last_synced_at"),
        "last_sync_job_id": doc.get("last_sync_job_id"),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


def _format_kb_document_brief(doc: dict) -> dict:
    """Brief format for sanity check results."""
    return {
        "id": doc.get("id", ""),
        "name": doc.get("name", ""),
        "size": doc.get("size", 0),
        "status": doc.get("status", "sync_pending"),
        "category": doc.get("category", "general"),
        "bedrock_sync_pending": bool(doc.get("bedrock_sync_pending", False)),
        "current_version": int(doc.get("current_version", 1)),
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


def _execute_kb_sync_inline(job: dict, sync_params: Optional[dict] = None) -> dict:
    """
    Execute the KB sync task directly in the API process.
    Used in local dev where there is no SQS → Lambda worker.
    """
    job_id = job["id"]
    try:
        from worker.tasks.kb_sync import process_kb_sync

        process_kb_sync({
            "job_id": job_id,
            "user_id": job.get("user_id", ""),
            "sync_params": sync_params or {},
        })

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
            "error": "Knowledge base sync failed. Please try again.",
            "inline": True,
        }


def _find_active_sync_job(user_id: str):
    """
    Check if there is already a QUEUED or IN_PROGRESS SYNC_KB job.
    Returns the job dict or None.

    Stale-job handling (prevents stuck jobs from blocking new sync requests):
    - QUEUED jobs older than 2 minutes → auto-marked FAILED (worker never picked up)
    - IN_PROGRESS jobs older than 10 minutes → auto-marked FAILED (worker may have crashed)
    """
    now = datetime.now(timezone.utc)
    stale_threshold_queued = 120       # 2 minutes for QUEUED (never picked up)
    stale_threshold_in_progress = 600  # 10 minutes for IN_PROGRESS (running too long)

    recent_jobs = dynamo_service.list_jobs(user_id, limit=20)
    for job in recent_jobs:
        if job.get("type") not in ("SYNC_KB", "SYNC_KB_DELETE"):
            continue
        if job.get("status") not in ("QUEUED", "IN_PROGRESS"):
            continue

        created_str = job.get("created_at", "")
        if created_str:
            try:
                created_at = datetime.fromisoformat(created_str)
                age_seconds = (now - created_at).total_seconds()
                threshold = (
                    stale_threshold_queued
                    if job["status"] == "QUEUED"
                    else stale_threshold_in_progress
                )
                if age_seconds > threshold:
                    logger.warning(
                        "Stale %s SYNC_KB job %s (age=%ds, threshold=%ds), marking FAILED",
                        job["status"],
                        job["id"],
                        age_seconds,
                        threshold,
                    )
                    dynamo_service.update_job(job["id"], {
                        "status": "FAILED",
                        "error": (
                            "Stale — worker never picked up the job"
                            if job["status"] == "QUEUED"
                            else "Stale — sync took too long, may have been interrupted"
                        ),
                    })
                    continue
            except (ValueError, TypeError):
                pass

        return job

    return None
