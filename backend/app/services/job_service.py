"""
NIX AI — Job Business Logic

Manages background job lifecycle (analysis, KB sync).
Synthetic data is generated externally and uploaded via the document flow.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.core.auth import CurrentUser
from app.core.exceptions import JobNotFoundError
from app.services import dynamo_service, s3_service, sqs_service

logger = logging.getLogger(__name__)


def get_job_status(job_id: str) -> dict:
    """Get status of a single job."""
    job = dynamo_service.get_job(job_id)
    if not job:
        raise JobNotFoundError(job_id)
    return _format_job(job)


def get_batch_status(job_ids: list[str]) -> list[dict]:
    """Get status of multiple jobs."""
    jobs = dynamo_service.get_jobs_by_ids(job_ids)
    return [_format_job(j) for j in jobs]


def list_jobs(user: CurrentUser, limit: int = 50) -> list[dict]:
    """List all jobs for the current user."""
    jobs = dynamo_service.list_jobs(user.user_id, limit)
    return [_format_job(j) for j in jobs]


def get_job_stats(job_id: str) -> dict:
    """Get statistics for a completed job."""
    job = dynamo_service.get_job(job_id)
    if not job:
        raise JobNotFoundError(job_id)

    result = job.get("result", {}) or {}
    return {
        "jobId": job["id"],
        "filesGenerated": result.get("files_generated", 0),
        "totalSize": result.get("total_size", 0),
        "duration": result.get("duration"),
        "modelId": result.get("model_id", ""),
    }


def cancel_job(job_id: str) -> dict:
    """Cancel a queued or processing job."""
    job = dynamo_service.get_job(job_id)
    if not job:
        raise JobNotFoundError(job_id)

    if job["status"] in ("COMPLETE", "FAILED", "CANCELLED"):
        return {"success": False, "jobId": job_id, "message": f"Job already {job['status']}"}

    dynamo_service.update_job(job_id, {"status": "CANCELLED"})
    return {"success": True, "jobId": job_id}


def retry_job(user: CurrentUser, job_id: str) -> dict:
    """Retry a failed job with the same parameters."""
    old_job = dynamo_service.get_job(job_id)
    if not old_job:
        raise JobNotFoundError(job_id)

    params = old_job.get("params", {})
    job_type = old_job.get("type", "GENERATE_SYNTHETIC")

    new_job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type=job_type,
        params=params,
    )

    if job_type == "ANALYZE_DOCUMENT":
        sqs_service.send_analysis_task(
            job_id=new_job["id"],
            doc_id=params.get("document_id", ""),
            s3_key=params.get("s3_key", ""),
            user_id=user.user_id,
        )
    elif job_type == "SYNC_KB":
        sqs_service.send_kb_sync_task(
            job_id=new_job["id"],
            user_id=user.user_id,
        )

    return {"newJobId": new_job["id"], "status": "QUEUED"}


def download_job_results(job_id: str, fmt: str = "csv") -> dict:
    """Get download URL for job results."""
    job = dynamo_service.get_job(job_id)
    if not job:
        raise JobNotFoundError(job_id)

    result = job.get("result", {}) or {}
    output_key = result.get("output_key", "")

    if not output_key:
        return {"error": "No results available yet", "jobId": job_id}

    download_url = s3_service.generate_presigned_download_url(output_key)
    return {
        "url": download_url,
        "jobId": job_id,
        "filename": f"results-{job_id}.{fmt}",
    }


def submit_kb_sync_job(user: CurrentUser) -> dict:
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
        # Production path: send to SQS → worker Lambda processes it
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
        # Local dev path: execute KB sync directly (no SQS/Lambda worker)
        logger.info("Running KB sync job %s inline (local dev mode)", job["id"])
        return _execute_kb_sync_inline(job)


def _execute_kb_sync_inline(job: dict) -> dict:
    """
    Execute the KB sync task directly in the API process.
    Used in local dev where there is no SQS → Lambda worker.
    """
    job_id = job["id"]
    try:
        from worker.tasks.kb_sync import process_kb_sync

        process_kb_sync({"job_id": job_id, "user_id": job.get("user_id", "")})

        # Re-read the job to get final status (the worker task updated it)
        updated = dynamo_service.get_job(job_id)
        final_status = updated.get("status", "COMPLETE") if updated else "COMPLETE"

        return {
            "jobId": job_id,
            "status": final_status,
            "createdAt": job.get("created_at", ""),
            "inline": True,  # Signal to frontend: already done, no polling needed
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
    Check if there is already a QUEUED or IN_PROGRESS SYNC_KB job
    for this user.  Returns the job dict or None.

    A QUEUED job older than 2 minutes is considered stale (the worker
    likely never picked it up) and is auto-marked FAILED so it won't
    block new sync requests.
    """
    now = datetime.now(timezone.utc)
    stale_threshold = 120  # 2 minutes

    recent_jobs = dynamo_service.list_jobs(user_id, limit=20)
    for job in recent_jobs:
        if job.get("type") != "SYNC_KB":
            continue
        if job.get("status") not in ("QUEUED", "IN_PROGRESS"):
            continue

        # Check if the job is stale
        created_str = job.get("created_at", "")
        if created_str:
            try:
                created_at = datetime.fromisoformat(created_str)
                age_seconds = (now - created_at).total_seconds()
                if age_seconds > stale_threshold:
                    logger.warning(
                        "Stale SYNC_KB job %s (age=%ds, status=%s) — marking FAILED",
                        job["id"], int(age_seconds), job["status"],
                    )
                    dynamo_service.update_job(job["id"], {
                        "status": "FAILED",
                        "error": f"Timed out — stuck in {job['status']} for {int(age_seconds)}s",
                    })
                    continue  # Skip this one, look for others
            except (ValueError, TypeError):
                pass  # Can't parse date, treat as active

        return job  # Fresh active job found
    return None


def _format_job(job: dict) -> dict:
    """Format DynamoDB item → API response."""
    # Convert progress int (0-100) → object { current, total, percent }
    raw_progress = job.get("progress", 0)
    if isinstance(raw_progress, dict):
        progress = raw_progress
    elif isinstance(raw_progress, (int, float)):
        progress = {
            "current": int(raw_progress),
            "total": 100,
            "percent": int(raw_progress),
        }
    else:
        progress = {"current": 0, "total": 100, "percent": 0}

    return {
        "id": job.get("id", ""),
        "jobId": job.get("id", ""),
        "type": job.get("type", ""),
        "status": job.get("status", "QUEUED"),
        "params": job.get("params", {}),
        "result": job.get("result"),
        "error": job.get("error"),
        "progress": progress,
        "currentStep": job.get("current_step"),
        "estimatedTimeRemaining": job.get("estimated_time_remaining"),
        "createdAt": job.get("created_at", ""),
        "updatedAt": job.get("updated_at", ""),
        "completedAt": job.get("completed_at"),
    }
