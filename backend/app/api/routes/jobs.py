"""
Job routes — matches frontend jobService.js endpoints:
  GET    /jobs                    → listJobs
  GET    /jobs/{job_id}           → getJobStatus
  POST   /jobs/batch-status       → pollMultipleJobs
  GET    /jobs/{job_id}/download  → downloadJobResults
  GET    /jobs/{job_id}/stats     → getJobStats
  POST   /jobs/{job_id}/cancel    → cancelJob
  POST   /jobs/{job_id}/retry     → retryJob

Note: POST /kb/sync has been moved to app/api/routes/kb.py
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.api.schemas.jobs import (
    BatchStatusRequest,
    BatchStatusResponse,
    JobListResponse,
    JobResponse,
    JobStatsResponse,
)
from app.core.auth import CurrentUser, get_current_user
from app.services import job_service

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """List all jobs for the current user."""
    jobs = job_service.list_jobs(user, limit)
    return JobListResponse(jobs=jobs)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get status of a single job."""
    return job_service.get_job_status(job_id)


@router.post("/jobs/batch-status", response_model=BatchStatusResponse)
async def batch_status(
    body: BatchStatusRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Get status of multiple jobs at once."""
    jobs = job_service.get_batch_status(body.jobIds)
    return BatchStatusResponse(jobs=jobs)


@router.get("/jobs/{job_id}/download")
async def download_results(
    job_id: str,
    format: str = Query("csv", pattern="^(csv|json|parquet)$"),
    user: CurrentUser = Depends(get_current_user),
):
    """Get download URL for job results."""
    return job_service.download_job_results(job_id, format)


@router.get("/jobs/{job_id}/stats", response_model=JobStatsResponse)
async def get_job_stats(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get statistics for a completed job."""
    return job_service.get_job_stats(job_id)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Cancel a queued or in-progress job."""
    return job_service.cancel_job(job_id)


@router.post("/jobs/{job_id}/retry")
async def retry_job(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Retry a failed job with the same parameters."""
    return job_service.retry_job(user, job_id)
