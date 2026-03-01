"""
Analytics routes — powers Dashboard + Past Analysis + Admin Analytics:
  GET    /analytics/dashboard        → User dashboard (enhanced)
  GET    /analytics/history          → User analysis history
  GET    /analytics/admin/platform   → Admin platform overview (admin only)
  GET    /analytics/admin/rag        → Admin RAG & KB metrics (admin only)
"""

from fastapi import APIRouter, Depends

from app.api.schemas.analytics import (
    AdminPlatformResponse,
    AdminRAGResponse,
    AnalysisHistoryResponse,
    EnhancedDashboardResponse,
)
from app.core.auth import CurrentUser, get_current_user, require_admin
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── User Analytics ───────────────────────────────────────────────

@router.get("/dashboard", response_model=EnhancedDashboardResponse)
async def get_dashboard(
    user: CurrentUser = Depends(get_current_user),
):
    """Enhanced dashboard analytics with chat usage and score trends."""
    return analytics_service.get_dashboard(user)


@router.get("/history", response_model=AnalysisHistoryResponse)
async def get_analysis_history(
    user: CurrentUser = Depends(get_current_user),
):
    """Full analysis history with findings for the current user."""
    return analytics_service.get_analysis_history(user)


# ── Admin Analytics (requires Admin group) ───────────────────────

@router.get("/admin/platform", response_model=AdminPlatformResponse)
async def get_admin_platform(
    user: CurrentUser = Depends(require_admin),
):
    """Platform-wide analytics: users, documents, scores, jobs, findings."""
    return analytics_service.get_admin_platform(user)


@router.get("/admin/rag", response_model=AdminRAGResponse)
async def get_admin_rag(
    user: CurrentUser = Depends(require_admin),
):
    """RAG & Knowledge Base performance: KB health, chat metrics, citations."""
    return analytics_service.get_admin_rag(user)
