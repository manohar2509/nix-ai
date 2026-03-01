"""
Analysis routes — matches frontend analysisService.js endpoints:
  POST   /analyze                        → triggerAnalysis
  GET    /analyze/{job_id}               → getAnalysisStatus
  GET    /documents/{doc_id}/analysis    → getAnalysisResults
  POST   /analyze/{job_id}/retry         → retryAnalysis
"""

from fastapi import APIRouter, Depends

from app.api.schemas.analysis import (
    AnalysisJobResponse,
    AnalysisResultResponse,
    AnalysisStatusResponse,
    TriggerAnalysisRequest,
)
from app.core.auth import CurrentUser, get_current_user
from app.services import analysis_service

router = APIRouter(tags=["analysis"])


@router.post("/analyze", response_model=AnalysisJobResponse)
async def trigger_analysis(
    body: TriggerAnalysisRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Trigger analysis for a document. Returns a jobId for polling."""
    return analysis_service.trigger_analysis(user, body.document_id)


@router.get("/analyze/{job_id}", response_model=AnalysisStatusResponse)
async def get_analysis_status(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Poll analysis job status."""
    return analysis_service.get_analysis_status(user, job_id)


@router.get("/documents/{doc_id}/analysis", response_model=AnalysisResultResponse)
async def get_analysis_results(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get completed analysis results for a document."""
    return analysis_service.get_analysis_results(user, doc_id)


@router.post("/analyze/{job_id}/retry", response_model=AnalysisJobResponse)
async def retry_analysis(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Retry a failed analysis job."""
    return analysis_service.retry_analysis(user, job_id)
