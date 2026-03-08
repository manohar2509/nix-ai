"""
Analysis routes — matches frontend analysisService.js endpoints:
  POST   /analyze                        → triggerAnalysis
  GET    /analyze/{job_id}               → getAnalysisStatus
  GET    /documents/{doc_id}/analysis    → getAnalysisResults
  POST   /analyze/{job_id}/retry         → retryAnalysis
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.schemas.analysis import (
    AnalysisJobResponse,
    AnalysisResultResponse,
    AnalysisStatusResponse,
    TriggerAnalysisRequest,
)
from app.core.auth import CurrentUser, get_current_user
from app.core.exceptions import NixAIException
from app.services import analysis_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


@router.post("/analyze", response_model=AnalysisJobResponse)
async def trigger_analysis(
    body: TriggerAnalysisRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Trigger analysis for a document. Returns a jobId for polling."""
    try:
        prefs_dict = body.preferences.model_dump() if body.preferences else None
        return analysis_service.trigger_analysis(user, body.document_id, preferences=prefs_dict)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Trigger analysis failed for doc %s: %s", body.document_id, exc)
        raise HTTPException(status_code=500, detail="Failed to start analysis. Please try again.")


@router.get("/analyze/{job_id}", response_model=AnalysisStatusResponse)
async def get_analysis_status(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Poll analysis job status."""
    try:
        return analysis_service.get_analysis_status(user, job_id)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get analysis status failed for job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail="Failed to check analysis progress. Please try again.")


@router.get("/documents/{doc_id}/analysis", response_model=AnalysisResultResponse)
async def get_analysis_results(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get completed analysis results for a document."""
    try:
        return analysis_service.get_analysis_results(user, doc_id)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get analysis results failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail="Failed to load analysis results. Please try again.")


@router.post("/analyze/{job_id}/retry", response_model=AnalysisJobResponse)
async def retry_analysis(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Retry a failed analysis job."""
    try:
        return analysis_service.retry_analysis(user, job_id)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Retry analysis failed for job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail="Failed to retry analysis. Please try again.")
