"""
Analytics routes — powers Dashboard + Past Analysis + Admin Analytics:
  GET    /analytics/dashboard        → User dashboard (enhanced)
  GET    /analytics/history          → User analysis history
  GET    /analytics/admin/platform   → Admin platform overview (admin only)
  GET    /analytics/admin/rag        → Admin RAG & KB metrics (admin only)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.schemas.analytics import (
    AdminPlatformResponse,
    AdminRAGResponse,
    AnalysisHistoryResponse,
    EnhancedDashboardResponse,
)
from app.core.auth import CurrentUser, get_current_user, require_admin
from app.core.exceptions import NixAIException
from app.services import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── User Analytics ───────────────────────────────────────────────

@router.get("/dashboard", response_model=EnhancedDashboardResponse)
async def get_dashboard(
    user: CurrentUser = Depends(get_current_user),
):
    """Enhanced dashboard analytics with chat usage and score trends."""
    try:
        return analytics_service.get_dashboard(user)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Dashboard failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to load dashboard: {str(exc)[:200]}")


@router.get("/history", response_model=AnalysisHistoryResponse)
async def get_analysis_history(
    user: CurrentUser = Depends(get_current_user),
):
    """Full analysis history with findings for the current user."""
    try:
        return analytics_service.get_analysis_history(user)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Analysis history failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to load analysis history: {str(exc)[:200]}")


# ── Admin Analytics (requires Admin group) ───────────────────────

@router.get("/admin/platform", response_model=AdminPlatformResponse)
async def get_admin_platform(
    user: CurrentUser = Depends(require_admin),
):
    """Platform-wide analytics: users, documents, scores, jobs, findings."""
    try:
        return analytics_service.get_admin_platform(user)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Admin platform analytics failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to load platform analytics: {str(exc)[:200]}")


@router.get("/admin/rag", response_model=AdminRAGResponse)
async def get_admin_rag(
    user: CurrentUser = Depends(require_admin),
):
    """RAG & Knowledge Base performance: KB health, chat metrics, citations."""
    try:
        return analytics_service.get_admin_rag(user)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Admin RAG analytics failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to load RAG analytics: {str(exc)[:200]}")
