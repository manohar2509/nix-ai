"""Job request / response schemas — matches frontend jobService.js contract."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ── Requests ─────────────────────────────────────────────────────
class BatchStatusRequest(BaseModel):
    """POST /jobs/batch-status body."""
    jobIds: list[str]


# ── Responses ────────────────────────────────────────────────────
class JobProgress(BaseModel):
    """Progress tracking for a job."""
    current: int = 0
    total: int = 0
    percent: int = 0


class JobResponse(BaseModel):
    """Single job record."""
    id: str
    jobId: str = ""  # alias for id in some contexts
    type: str = ""  # GENERATE_SYNTHETIC | ANALYZE_DOCUMENT
    status: str = "QUEUED"  # QUEUED | IN_PROGRESS | COMPLETE | FAILED | CANCELLED
    params: dict = {}
    result: Optional[dict] = None
    error: Optional[str] = None
    progress: JobProgress = JobProgress()
    currentStep: Optional[str] = None
    estimatedTimeRemaining: Optional[int] = None
    createdAt: str = ""
    updatedAt: str = ""
    completedAt: Optional[str] = None


class JobSubmitResponse(BaseModel):
    """POST /generate or POST /kb/sync response."""
    jobId: str
    status: str = "QUEUED"
    createdAt: str = ""
    deduplicated: bool = False
    inline: bool = False
    error: Optional[str] = None


class JobListResponse(BaseModel):
    jobs: list[JobResponse] = []


class BatchStatusResponse(BaseModel):
    jobs: list[JobResponse] = []


class JobStatsResponse(BaseModel):
    jobId: str
    filesGenerated: int = 0
    totalSize: int = 0
    duration: Optional[float] = None
    modelId: str = ""
