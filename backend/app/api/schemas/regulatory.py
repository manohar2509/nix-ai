"""
NIX AI — Regulatory Intelligence Schemas

Covers all new requirements:
  REQ-1: ICH Guideline Cross-Reference
  REQ-2: Multi-Jurisdiction Compass
  REQ-3: Amendment Impact Simulator
  REQ-4: Audit Trail / Timeline
  REQ-5: Payer Evidence Gap Analyzer
  REQ-6: Protocol Comparison Engine
  REQ-7: Smart Clause Library
  REQ-8: PDF Report Export
  REQ-9: Role-Based Views
  REQ-10: ClinicalTrials.gov Benchmark
"""

from __future__ import annotations

from typing import Optional, Union

from pydantic import BaseModel, Field


# ════════════════════════════════════════════════════════════════
# REQ-1: ICH Guideline Cross-Reference
# ════════════════════════════════════════════════════════════════
class GuidelineReference(BaseModel):
    """A specific ICH/FDA/EMA guideline citation."""
    code: str = ""              # e.g. "ICH E6(R3)"
    section: str = ""           # e.g. "5.2.1"
    title: str = ""             # e.g. "Good Clinical Practice"
    url: str = ""               # link to official guideline PDF
    relevance: str = ""         # why this guideline applies


class EnhancedFinding(BaseModel):
    """Finding enriched with guideline refs, clauses, jurisdiction, payer gaps."""
    id: str = ""
    type: str = ""                          # conflict | recommendation | risk | payer_evidence_gap
    severity: str = "medium"                # low | medium | high | critical
    title: str = ""
    description: str = ""
    section: Optional[str] = None           # protocol section
    suggestion: Optional[str] = None        # recommended fix
    confidence: Optional[float] = None      # 0-100 confidence

    # REQ-1: ICH guideline references
    guideline_refs: list[GuidelineReference] = []

    # REQ-2: Jurisdiction-specific impact
    jurisdictions_affected: list[str] = []  # ["FDA", "EMA", "PMDA", ...]

    # REQ-7: Smart Clause — protocol-ready text
    suggested_clause: Optional[str] = None


# ════════════════════════════════════════════════════════════════
# REQ-2: Multi-Jurisdiction Compass
# ════════════════════════════════════════════════════════════════
class KeyGuideline(BaseModel):
    """Enriched guideline reference in jurisdiction scores."""
    code: str = ""
    url: Optional[str] = None
    title: Optional[str] = None
    source_type: Optional[str] = None
    section: Optional[str] = None
    relevance: Optional[str] = None


class JurisdictionScore(BaseModel):
    """Per-jurisdiction compliance assessment."""
    jurisdiction: str           # FDA, EMA, PMDA, NMPA, Health_Canada, MHRA
    label: str                  # "U.S. FDA", "EU EMA", etc.
    flag: str                   # emoji flag
    compliance_score: float = 0 # 0-100
    risk_level: str = "medium"  # low | medium | high | critical
    blockers: list[str] = []    # hard blockers
    adaptations: list[str] = [] # recommended local adaptations
    key_guidelines: list[Union[str, KeyGuideline]] = []  # plain codes or enriched objects


class JurisdictionCompassResponse(BaseModel):
    """Full multi-jurisdiction assessment."""
    document_id: str
    jurisdictions: list[JurisdictionScore] = []
    global_readiness_score: float = 0
    recommended_submission_order: list[str] = []
    summary: str = ""


# ════════════════════════════════════════════════════════════════
# REQ-3: Amendment Impact Simulator
# ════════════════════════════════════════════════════════════════
class SimulateAmendmentRequest(BaseModel):
    """Request to simulate a protocol amendment."""
    document_id: str = Field(..., min_length=1)
    amendment_description: str = Field(..., min_length=10,
        description="Natural language description of the proposed change")


class ScoreDelta(BaseModel):
    """Before/after score comparison."""
    before: float = 0
    after: float = 0
    delta: float = 0
    direction: str = "neutral"  # improved | degraded | neutral


class AmendmentImpact(BaseModel):
    """Result of an amendment simulation."""
    id: str = ""
    document_id: str = ""
    amendment_description: str = ""
    regulator_delta: ScoreDelta = ScoreDelta()
    payer_delta: ScoreDelta = ScoreDelta()
    new_findings: list[EnhancedFinding] = []
    resolved_findings: list[str] = []       # IDs of findings resolved by amendment
    net_risk_change: str = "neutral"        # improved | degraded | neutral
    summary: str = ""
    created_at: str = ""


class SimulationJobResponse(BaseModel):
    """POST /simulate → response."""
    jobId: str
    status: str = "QUEUED"
    inline: bool = False
    result: Optional[AmendmentImpact] = None


# ════════════════════════════════════════════════════════════════
# REQ-4: Audit Trail / Protocol Timeline
# ════════════════════════════════════════════════════════════════
class TimelineEvent(BaseModel):
    """A single event in the protocol lifecycle."""
    id: str = ""
    event_type: str = ""        # upload | analysis | amendment | chat | kb_sync | export
    title: str = ""
    description: str = ""
    timestamp: str = ""
    actor: str = ""             # user name or "system"
    metadata: dict = {}         # event-type-specific data (scores, job_id, etc.)


class TimelineResponse(BaseModel):
    """Full protocol timeline."""
    document_id: str
    document_name: str = ""
    events: list[TimelineEvent] = []
    total_events: int = 0


# ════════════════════════════════════════════════════════════════
# REQ-5: Payer Evidence Gap Analyzer
# ════════════════════════════════════════════════════════════════
class PayerGap(BaseModel):
    """A specific payer/HTA evidence gap."""
    id: str = ""
    hta_body: str = ""          # NICE, IQWIG, CADTH, PBAC, AMNOG
    requirement: str = ""       # what the HTA body expects
    gap_description: str = ""   # what's missing in the protocol
    severity: str = "medium"    # low | medium | high | critical
    recommendation: str = ""    # how to address the gap
    impact_on_reimbursement: str = ""  # estimated impact


class PayerGapResponse(BaseModel):
    """Full payer evidence gap analysis."""
    document_id: str
    overall_hta_readiness: float = 0    # 0-100
    gaps: list[PayerGap] = []
    hta_body_scores: dict = {}          # { "NICE": 72, "IQWIG": 45, ... }
    summary: str = ""


# ════════════════════════════════════════════════════════════════
# REQ-6: Protocol Comparison Engine
# ════════════════════════════════════════════════════════════════
class CompareProtocolsRequest(BaseModel):
    """Request to compare two or more protocols."""
    document_ids: list[str] = Field(..., min_length=2, max_length=5)


class ComparisonDimension(BaseModel):
    """One dimension of comparison between protocols."""
    dimension: str = ""         # e.g. "Primary Endpoint", "Sample Size", "Statistical Design"
    values: dict = {}           # { doc_id: "value" }
    winner: Optional[str] = None  # doc_id of the better protocol for this dimension
    rationale: str = ""


class ComparisonResponse(BaseModel):
    """Full comparison result."""
    document_ids: list[str]
    document_names: dict = {}           # { doc_id: name }
    dimensions: list[ComparisonDimension] = []
    score_comparison: dict = {}         # { doc_id: { regulator: 80, payer: 65 } }
    overall_winner: Optional[str] = None
    summary: str = ""


# ════════════════════════════════════════════════════════════════
# REQ-8: Report Export
# ════════════════════════════════════════════════════════════════
class ReportRequest(BaseModel):
    """Request to generate a PDF report."""
    document_id: str = Field(..., min_length=1)
    include_sections: list[str] = Field(
        default=["executive_summary", "jurisdiction_compass", "findings",
                 "payer_gaps", "timeline", "benchmark"],
        description="Which sections to include in the report"
    )
    format: str = "pdf"  # pdf | json


class ReportResponse(BaseModel):
    """Report generation result."""
    document_id: str
    report_url: Optional[str] = None    # S3 presigned URL for PDF
    report_data: Optional[dict] = None  # JSON data if format=json
    generated_at: str = ""


# ════════════════════════════════════════════════════════════════
# REQ-10: ClinicalTrials.gov Benchmarking
# ════════════════════════════════════════════════════════════════
class BenchmarkRequest(BaseModel):
    """Request to benchmark against similar trials."""
    document_id: str = Field(..., min_length=1)
    therapeutic_area: Optional[str] = None
    phase: Optional[str] = None
    indication: Optional[str] = None


class TrialBenchmark(BaseModel):
    """A single benchmark data point."""
    metric: str = ""            # e.g. "Sample Size", "Duration", "Primary Endpoint Type"
    protocol_value: str = ""    # value from user's protocol
    benchmark_median: str = ""  # median from similar trials
    benchmark_range: str = ""   # range from similar trials
    percentile: Optional[float] = None  # where the protocol falls
    assessment: str = ""        # "above_average" | "below_average" | "typical"


class BenchmarkResponse(BaseModel):
    """Full benchmark result."""
    document_id: str
    similar_trials_count: int = 0
    search_criteria: dict = {}
    benchmarks: list[TrialBenchmark] = []
    summary: str = ""


# ════════════════════════════════════════════════════════════════
# Enhanced Analysis Response (wraps all new features)
# ════════════════════════════════════════════════════════════════
class EnhancedAnalysisResponse(BaseModel):
    """Extended analysis results including all REQ features."""
    # Original fields
    regulatorScore: float = 0.0
    payerScore: float = 0.0
    findings: list[EnhancedFinding] = []
    summary: str = ""
    analyzed_at: str = ""
    extraction_method: Optional[str] = None

    # REQ-2: Jurisdiction compass
    jurisdiction_scores: list[JurisdictionScore] = []
    global_readiness_score: float = 0

    # REQ-5: Payer gaps
    payer_gaps: list[PayerGap] = []
    hta_body_scores: dict = {}

    # REQ-10: Benchmark data (populated on demand)
    benchmark: Optional[BenchmarkResponse] = None
