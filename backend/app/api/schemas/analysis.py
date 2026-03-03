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


# ── Sub-models ───────────────────────────────────────────────────
class GuidelineRef(BaseModel):
    """ICH guideline cross-reference on a finding (REQ-1)."""
    code: str = ""
    section: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    relevance: Optional[str] = None


class Finding(BaseModel):
    id: str = ""
    type: str = ""  # conflict | recommendation | risk | payer_evidence_gap
    severity: str = "medium"  # low | medium | high | critical
    title: str = ""
    description: str = ""
    section: Optional[str] = None
    suggestion: Optional[str] = None
    confidence: Optional[int] = None
    guideline_refs: list[GuidelineRef] = []
    jurisdictions_affected: list[str] = []
    suggested_clause: Optional[str] = None


class JurisdictionScore(BaseModel):
    """Per-jurisdiction regulatory compliance score (REQ-2)."""
    jurisdiction: str = ""
    label: str = ""
    flag: str = ""
    compliance_score: float = 0
    risk_level: str = "medium"
    blockers: list[str] = []
    adaptations: list[str] = []
    key_guidelines: list[str] = []


class PayerGap(BaseModel):
    """HTA/payer evidence gap (REQ-5)."""
    id: str = ""
    hta_body: str = ""
    requirement: str = ""
    gap_description: str = ""
    severity: str = "medium"
    recommendation: str = ""
    impact_on_reimbursement: str = ""


# ── Responses ────────────────────────────────────────────────────
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
    """GET /documents/:docId/analysis → completed analysis (enhanced)."""
    regulatorScore: float = 0.0
    payerScore: float = 0.0
    findings: list[Finding] = []
    summary: str = ""
    analyzed_at: str = ""
    extraction_method: Optional[str] = None
    # REQ-2: Jurisdiction Compass
    jurisdiction_scores: list[JurisdictionScore] = []
    global_readiness_score: float = 0.0
    # REQ-5: Payer Gaps
    payer_gaps: list[PayerGap] = []
    hta_body_scores: dict = {}


# ── Simulation schemas (REQ-3) ──────────────────────────────────
class SimulateAmendmentRequest(BaseModel):
    """POST /documents/:docId/simulate body."""
    amendment_text: str = Field(..., min_length=10, max_length=5000)


class SimulationJobResponse(BaseModel):
    """POST /documents/:docId/simulate → immediate response."""
    jobId: str
    simId: str
    status: str = "QUEUED"
    inline: bool = False


class SimulationResultResponse(BaseModel):
    """GET /documents/:docId/simulations → completed simulations."""
    id: str
    amendment_text: str = ""
    status: str = "QUEUED"
    result: Optional[dict] = None
    created_at: str = ""


# ── Comparison schemas (REQ-6) ──────────────────────────────────
class CompareProtocolsRequest(BaseModel):
    """POST /compare body."""
    document_ids: list[str] = Field(..., min_length=2, max_length=5)


class ComparisonJobResponse(BaseModel):
    """POST /compare → immediate response."""
    jobId: str
    cmpId: str
    status: str = "QUEUED"
    inline: bool = False


# ── Report schema (REQ-8) ───────────────────────────────────────
class ReportRequest(BaseModel):
    """POST /documents/:docId/report body."""
    format: str = "json"  # json | pdf_data
    sections: list[str] = ["all"]
