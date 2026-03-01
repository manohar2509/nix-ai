"""Analysis request / response schemas — matches frontend analysisService.js contract."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ── Requests ─────────────────────────────────────────────────────
class AnalysisPreferences(BaseModel):
    """User-configurable analysis preferences from ConfigurationView."""
    risk_sensitivity: str = "balanced"       # conservative | balanced | aggressive
    analysis_focus: str = "both"             # regulatory | payer | both
    include_recommendations: bool = True
    regulatory_threshold: int = 50           # Score below this = high risk
    payer_threshold: int = 50


class TriggerAnalysisRequest(BaseModel):
    """POST /analyze body."""
    document_id: str = Field(..., min_length=1)
    preferences: Optional[AnalysisPreferences] = None


# ── Responses ────────────────────────────────────────────────────
class Finding(BaseModel):
    id: str = ""
    type: str = ""  # conflict | recommendation | risk
    severity: str = "medium"  # low | medium | high | critical
    title: str = ""
    description: str = ""
    section: Optional[str] = None
    suggestion: Optional[str] = None


class AnalysisJobResponse(BaseModel):
    """POST /analyze → immediate response."""
    jobId: str
    status: str = "QUEUED"
    inline: bool = False
    error: Optional[str] = None


class AnalysisStatusResponse(BaseModel):
    """GET /analyze/:jobId → polling response."""
    jobId: str
    status: str  # QUEUED | IN_PROGRESS | COMPLETE | FAILED
    progress: int = 0  # 0-100
    result: Optional[dict] = None
    error: Optional[str] = None


class AnalysisResultResponse(BaseModel):
    """GET /documents/:docId/analysis → completed analysis."""
    regulatorScore: float = 0.0
    payerScore: float = 0.0
    findings: list[Finding] = []
    summary: str = ""
    analyzed_at: str = ""
    extraction_method: Optional[str] = None  # native_document_block | text_fallback | textract
