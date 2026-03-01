"""
NIX AI — Analysis Business Logic

Orchestrates document analysis:
  1. Create a job record (QUEUED)
  2. Push to SQS for the Worker Lambda
  3. Return job ID for polling
"""

from __future__ import annotations

import logging

from app.core.auth import CurrentUser
from app.core.exceptions import AnalysisNotFoundError, DocumentNotFoundError, JobNotFoundError
from app.services import dynamo_service, sqs_service

logger = logging.getLogger(__name__)


def trigger_analysis(user: CurrentUser, document_id: str, preferences: dict | None = None) -> dict:
    """
    Trigger a new analysis job for a document.

    Two execution modes:
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    • Lambda (production):  Creates DynamoDB job → sends SQS message
                            → Worker Lambda picks it up asynchronously.
    • Local dev (uvicorn):  Creates DynamoDB job → executes analysis
                            task INLINE (no SQS) → returns with final status.
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """
    from app.core.config import get_settings

    settings = get_settings()

    # Verify document exists
    doc = dynamo_service.get_document(document_id)
    if not doc:
        raise DocumentNotFoundError(document_id)

    # Reset document if stuck in "analyzing" or "error" — allows re-analysis
    current_status = doc.get("status", "uploaded")
    if current_status in ("analyzing", "error"):
        logger.info(
            "Resetting document %s from '%s' to 'uploaded' for re-analysis",
            document_id, current_status,
        )
        dynamo_service.update_document(document_id, {"status": "uploaded"})

    # Create job record
    job_params = {"document_id": document_id, "s3_key": doc.get("s3_key", "")}
    if preferences:
        job_params["preferences"] = preferences
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="ANALYZE_DOCUMENT",
        params=job_params,
    )

    # Create analysis record linked to this job
    analysis = dynamo_service.create_analysis(
        doc_id=document_id,
        job_id=job["id"],
    )

    # Update document status
    dynamo_service.update_document(document_id, {
        "status": "analyzing",
        "analysis_id": analysis["id"],
    })

    # ── Decide: SQS (Lambda) or inline (local dev) ──
    if settings.is_lambda:
        # Production path: send to SQS → worker Lambda processes it
        sqs_service.send_analysis_task(
            job_id=job["id"],
            doc_id=document_id,
            s3_key=doc.get("s3_key", ""),
            user_id=user.user_id,
            preferences=preferences,
        )
        logger.info("Analysis job %s queued to SQS", job["id"])
        return {"jobId": job["id"], "status": "QUEUED"}
    else:
        # Local dev path: execute analysis directly (no SQS/Lambda worker)
        logger.info("Running analysis job %s inline (local dev mode)", job["id"])
        return _execute_analysis_inline(job, document_id, doc.get("s3_key", ""), user.user_id, preferences)


def _execute_analysis_inline(job: dict, doc_id: str, s3_key: str, user_id: str, preferences: dict | None = None) -> dict:
    """
    Execute the document analysis task directly in the API process.
    Used in local dev where there is no SQS → Lambda worker.
    """
    job_id = job["id"]
    try:
        from worker.tasks.document_analysis import process_document_analysis

        payload = {
            "job_id": job_id,
            "doc_id": doc_id,
            "s3_key": s3_key,
            "user_id": user_id,
        }
        if preferences:
            payload["preferences"] = preferences
        process_document_analysis(payload)

        # Re-read the job to get final status
        updated = dynamo_service.get_job(job_id)
        final_status = updated.get("status", "COMPLETE") if updated else "COMPLETE"

        return {
            "jobId": job_id,
            "status": final_status,
            "inline": True,  # Signal to frontend: already done, no polling needed
        }
    except Exception as exc:
        logger.error("Inline analysis failed for job %s: %s", job_id, exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        return {
            "jobId": job_id,
            "status": "FAILED",
            "error": str(exc),
            "inline": True,
        }


def get_analysis_status(user: CurrentUser, job_id: str) -> dict:
    """Poll analysis status by job ID with ownership verification."""
    job = dynamo_service.get_job(job_id)
    if not job:
        raise JobNotFoundError(job_id)

    # Verify the caller owns this job
    if job.get("user_id") and job["user_id"] != user.user_id:
        raise JobNotFoundError(job_id)

    return {
        "jobId": job["id"],
        "status": job.get("status", "QUEUED"),
        "progress": job.get("progress", 0),
        "result": job.get("result"),
        "error": job.get("error"),
    }


def get_analysis_results(user: CurrentUser, doc_id: str) -> dict:
    """Get completed analysis results for a document with ownership check."""
    # Verify the caller owns the document
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)
    if doc.get("user_id") and doc["user_id"] != user.user_id:
        raise DocumentNotFoundError(doc_id)

    analysis = dynamo_service.get_analysis_for_document(doc_id)
    if not analysis:
        raise AnalysisNotFoundError(doc_id)

    return {
        "regulatorScore": analysis.get("regulator_score", 0),
        "payerScore": analysis.get("payer_score", 0),
        "findings": analysis.get("findings", []),
        "summary": analysis.get("summary", ""),
        "analyzed_at": analysis.get("completed_at", ""),
        "extraction_method": analysis.get("extraction_method"),
    }


def retry_analysis(user: CurrentUser, job_id: str) -> dict:
    """Retry a failed analysis job.

    Creates a fresh job AND a fresh analysis record, resets the document
    status to 'analyzing', so the full pipeline runs cleanly.
    """
    from app.core.config import get_settings

    settings = get_settings()

    old_job = dynamo_service.get_job(job_id)
    if not old_job:
        raise JobNotFoundError(job_id)

    # Verify ownership
    if old_job.get("user_id") and old_job["user_id"] != user.user_id:
        raise JobNotFoundError(job_id)

    params = old_job.get("params", {})
    document_id = params.get("document_id", "")

    # Create a new job with same params
    new_job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="ANALYZE_DOCUMENT",
        params=params,
    )

    # Create a fresh analysis record and link it to the document
    if document_id:
        analysis = dynamo_service.create_analysis(
            doc_id=document_id,
            job_id=new_job["id"],
        )
        dynamo_service.update_document(document_id, {
            "status": "analyzing",
            "analysis_id": analysis["id"],
        })

    if settings.is_lambda:
        sqs_service.send_analysis_task(
            job_id=new_job["id"],
            doc_id=document_id,
            s3_key=params.get("s3_key", ""),
            user_id=user.user_id,
        )
        return {"jobId": new_job["id"], "status": "QUEUED"}
    else:
        logger.info("Retrying analysis job %s inline (local dev mode)", new_job["id"])
        return _execute_analysis_inline(
            new_job, document_id, params.get("s3_key", ""), user.user_id
        )
