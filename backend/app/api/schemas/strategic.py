"""
NIX AI — Strategic Intelligence Schemas

Pydantic models for the 8 killer features:
  1. Adversarial Council
  2. Strategic Friction Heatmap
  3. Trial Cost Architect
  4. Synthetic Payer Simulator
  5. Submission Strategy
  6. Protocol Optimizer
  7. Deal Room / Investor Report
  8. Compliance Watchdog
  + Smart Clause Library
  + Portfolio Risk
  + Cross-Protocol Intelligence
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ════════════════════════════════════════════════════════════════
# COMMON: Document-only request
# ════════════════════════════════════════════════════════════════
class DocumentRequest(BaseModel):
    """Request that only needs a document ID."""
    document_id: str = Field(..., min_length=1)


# ════════════════════════════════════════════════════════════════
# 1. ADVERSARIAL COUNCIL
# ════════════════════════════════════════════════════════════════
class ScoreImpact(BaseModel):
    regulatory: str = ""
    payer: str = ""
    rationale: str = ""


class AgentArgument(BaseModel):
    position: str = ""
    argument: str = ""
    guideline_refs: list[str] = []
    score_impact: Optional[dict] = None
    cost_impact: Optional[str] = None
    denial_risk: Optional[str] = None
    enrollment_impact: Optional[str] = None


class MediatorResolution(BaseModel):
    resolution: str = ""
    projected_scores: dict = {}
    implementation: str = ""


class CouncilRound(BaseModel):
    round_number: int = 0
    topic: str = ""
    finding_id: Optional[str] = None
    dr_no: AgentArgument = AgentArgument()
    the_accountant: AgentArgument = AgentArgument()
    patient_advocate: AgentArgument = AgentArgument()
    mediator: MediatorResolution = MediatorResolution()


class CouncilVerdict(BaseModel):
    current_scores: dict = {}
    optimized_scores: dict = {}
    key_tradeoffs: list[str] = []
    executive_summary: str = ""
    consensus_reached: Optional[bool] = None
    confidence_level: Optional[str] = None
    priority_actions: list[str] = []


class CouncilResponse(BaseModel):
    protocol_name: str = ""
    opening_summary: str = ""
    rounds: list[CouncilRound] = []
    final_verdict: CouncilVerdict = CouncilVerdict()
    # Async debate fields (new — boardroom architecture)
    debate_id: Optional[str] = None
    is_async: bool = False
    transcript: Optional[list[dict]] = None


# ════════════════════════════════════════════════════════════════
# ASYNC BOARDROOM DEBATE (NEW)
# ════════════════════════════════════════════════════════════════
class StartDebateRequest(BaseModel):
    """Request to start an async boardroom debate."""
    max_rounds: int = Field(default=3, ge=1, le=5)


class StartDebateResponse(BaseModel):
    """Response when a debate is kicked off asynchronously."""
    debate_id: str
    job_id: str
    status: str = "QUEUED"
    message: str = "Boardroom debate initiated. Poll for updates."


class DebateTranscriptTurn(BaseModel):
    """A single turn in the debate transcript."""
    agent: str = ""
    role: str = ""
    content: str = ""
    round_number: int = 0
    tool_calls: list[dict] = []
    topic: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    timestamp: Optional[str] = None
    error: Optional[str] = None
    verdict: Optional[dict] = None


class DebateStatusResponse(BaseModel):
    """Real-time status of an ongoing debate."""
    debate_id: str
    status: str = "QUEUED"
    progress: int = 0
    protocol_name: str = ""
    scores: dict = {}
    current_round: int = 0
    total_rounds: int = 0
    current_topic: str = ""
    transcript: list[DebateTranscriptTurn] = []
    final_verdict: Optional[dict] = None
    total_turns: int = 0
    rounds_completed: int = 0
    elapsed_seconds: float = 0
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None


# ════════════════════════════════════════════════════════════════
# 2. FRICTION HEATMAP
# ════════════════════════════════════════════════════════════════
class FrictionSection(BaseModel):
    section_id: str = ""
    section_title: str = ""
    section_number: str = ""
    regulatory_risk: float = 0
    commercial_risk: float = 0
    friction_score: float = 0
    risk_category: str = "low_risk"
    regulatory_detail: str = ""
    commercial_detail: str = ""
    friction_explanation: str = ""
    related_finding_ids: list[str] = []
    guideline_refs: list[str] = []
    quick_fix: str = ""
    text_excerpt: str = ""


class OverallFriction(BaseModel):
    score: float = 0
    hotspots: list[str] = []
    summary: str = ""


class FrictionMapResponse(BaseModel):
    sections: list[FrictionSection] = []
    overall_friction: OverallFriction = OverallFriction()


# ════════════════════════════════════════════════════════════════
# 3. TRIAL COST ARCHITECT
# ════════════════════════════════════════════════════════════════
class ProtocolParameters(BaseModel):
    phase: str = ""
    therapeutic_area: str = ""
    target_enrollment: int = 0
    number_of_arms: int = 0
    number_of_sites: int = 0
    study_duration_months: int = 0
    treatment_duration_months: int = 0
    estimated_visits_per_patient: int = 0
    estimated_screen_failure_rate: float = 0


class CostEstimate(BaseModel):
    total_estimated_cost_usd: float = 0
    cost_range_low_usd: float = 0
    cost_range_high_usd: float = 0
    per_patient_cost_usd: float = 0
    industry_benchmark_per_patient: float = 0
    vs_benchmark: str = ""


class CostBreakdownItem(BaseModel):
    category: str = ""
    estimated_cost_usd: float = 0
    percentage: float = 0
    detail: str = ""


class FindingCostImpact(BaseModel):
    finding_id: str = ""
    finding_title: str = ""
    cost_impact_usd: float = 0
    cost_impact_direction: str = ""
    timeline_impact_months: float = 0
    explanation: str = ""
    fix_cost_usd: float = 0
    fix_savings_usd: float = 0
    roi_ratio: str = ""


class AmendmentRisk(BaseModel):
    predicted_amendments: int = 0
    estimated_amendment_cost_usd: float = 0
    high_risk_triggers: list[str] = []
    prevention_savings_usd: float = 0


class CostScenario(BaseModel):
    scenario: str = ""
    total_cost_usd: float = 0
    timeline_months: int = 0
    regulatory_risk: str = ""
    changes: list[str] = []


class ROISummary(BaseModel):
    nix_ai_analysis_value: str = ""
    amendment_prevention_value_usd: float = 0
    time_savings_value_usd: float = 0
    total_potential_savings_usd: float = 0


class CostAnalysisResponse(BaseModel):
    protocol_parameters: ProtocolParameters = ProtocolParameters()
    cost_estimate: CostEstimate = CostEstimate()
    cost_breakdown: list[CostBreakdownItem] = []
    finding_cost_impacts: list[FindingCostImpact] = []
    amendment_risk: AmendmentRisk = AmendmentRisk()
    optimization_scenarios: list[CostScenario] = []
    roi_summary: ROISummary = ROISummary()


# ════════════════════════════════════════════════════════════════
# 4. PAYER SIMULATOR
# ════════════════════════════════════════════════════════════════
class InsurerPrediction(BaseModel):
    insurer: str = ""
    covered_lives_millions: float = 0
    predicted_coverage_decision: str = ""
    denial_probability_pct: float = 0
    key_concerns: list[str] = []
    required_evidence: list[str] = []
    formulary_tier_prediction: str = ""
    prior_auth_likely: bool = False
    step_therapy_likely: bool = False


class HTAPrediction(BaseModel):
    body: str = ""
    country: str = ""
    predicted_recommendation: str = ""
    confidence_pct: float = 0
    key_gaps: list[str] = []
    estimated_icer_category: str = ""
    reimbursement_probability_pct: float = 0


class RevenueImpact(BaseModel):
    assumed_annual_drug_price_usd: float = 0
    target_patient_population: int = 0
    max_annual_revenue_usd: float = 0
    current_protocol_revenue_projection_usd: float = 0
    optimized_protocol_revenue_projection_usd: float = 0
    revenue_at_risk_usd: float = 0
    explanation: str = ""


class FixPackageItem(BaseModel):
    action: str = ""
    cost_to_implement_usd: float = 0
    denial_reduction_pct: float = 0
    revenue_impact_usd: float = 0
    roi_ratio: str = ""
    affected_insurers: list[str] = []


class PayerSimulationResponse(BaseModel):
    overall_denial_risk_pct: float = 0
    denial_risk_category: str = ""
    insurer_predictions: list[InsurerPrediction] = []
    hta_predictions: list[HTAPrediction] = []
    revenue_impact: RevenueImpact = RevenueImpact()
    fix_package: list[FixPackageItem] = []
    executive_summary: str = ""


# ════════════════════════════════════════════════════════════════
# 5. SUBMISSION STRATEGY
# ════════════════════════════════════════════════════════════════
class SubmissionEntry(BaseModel):
    rank: int = 0
    jurisdiction: str = ""
    compliance_score: float = 0
    recommended_pathway: str = ""
    estimated_review_months: int = 0
    rationale: str = ""
    blockers_to_resolve: list[str] = []
    estimated_approval_date: str = ""


class SimultaneousFiling(BaseModel):
    feasible: bool = False
    max_simultaneous: int = 0
    recommended_simultaneous: list[str] = []
    explanation: str = ""


class GoldenProtocolChange(BaseModel):
    change: str = ""
    resolves_for: list[str] = []
    regulatory_justification: str = ""
    effort_level: str = ""
    cost_impact: str = ""


class TimelineComparison(BaseModel):
    current_sequential_months: int = 0
    optimized_parallel_months: int = 0
    time_saved_months: int = 0
    market_revenue_impact: str = ""


class PathwayRecommendation(BaseModel):
    jurisdiction: str = ""
    standard_pathway: str = ""
    recommended_pathway: str = ""
    eligibility_rationale: str = ""
    timeline_benefit_months: int = 0


class JurisdictionGapEntry(BaseModel):
    protocol_section: str = ""
    fda_status: str = ""
    ema_status: str = ""
    pmda_status: str = ""
    gap_detail: str = ""
    resolution: str = ""


class SubmissionStrategyResponse(BaseModel):
    recommended_submission_order: list[SubmissionEntry] = []
    simultaneous_filing_feasibility: SimultaneousFiling = SimultaneousFiling()
    golden_protocol_changes: list[GoldenProtocolChange] = []
    timeline_comparison: TimelineComparison = TimelineComparison()
    pathway_recommendations: list[PathwayRecommendation] = []
    jurisdiction_gap_matrix: list[JurisdictionGapEntry] = []
    executive_summary: str = ""


# ════════════════════════════════════════════════════════════════
# 6. PROTOCOL OPTIMIZER
# ════════════════════════════════════════════════════════════════
class OptimizationItem(BaseModel):
    id: str = ""
    finding_id: str = ""
    finding_title: str = ""
    section: str = ""
    severity: str = ""
    original_text: str = ""
    optimized_text: str = ""
    change_summary: str = ""
    regulatory_justification: str = ""
    guideline_refs: list[str] = []
    projected_score_impact: dict = {}
    cost_impact: str = ""
    risk_level: str = ""


class OptimizationSummary(BaseModel):
    total_optimizations: int = 0
    projected_regulatory_score: float = 0
    projected_payer_score: float = 0
    current_regulatory_score: float = 0
    current_payer_score: float = 0
    critical_fixes: int = 0
    high_fixes: int = 0
    net_cost_impact: str = ""
    executive_summary: str = ""


class ProtocolOptimizationResponse(BaseModel):
    optimizations: list[OptimizationItem] = []
    summary: OptimizationSummary = OptimizationSummary()


# ════════════════════════════════════════════════════════════════
# 7. DEAL ROOM / INVESTOR REPORT
# ════════════════════════════════════════════════════════════════
class ExecutiveSummary(BaseModel):
    headline: str = ""
    risk_rating: str = ""
    investment_readiness: str = ""
    key_strength: str = ""
    key_risk: str = ""
    one_paragraph_summary: str = ""


class RegulatoryScorecard(BaseModel):
    overall_score: float = 0
    regulatory_compliance: float = 0
    market_access_readiness: float = 0
    global_readiness: float = 0
    benchmark_vs_industry: str = ""
    probability_of_approval_pct: float = 0
    explanation: str = ""


class CompetitivePositioning(BaseModel):
    protocol_quality_percentile: float = 0
    design_strengths: list[str] = []
    design_gaps: list[str] = []
    vs_similar_trials: str = ""


class FinancialRiskAssessment(BaseModel):
    estimated_trial_cost_range: str = ""
    amendment_risk: str = ""
    timeline_risk: str = ""
    market_access_risk: str = ""
    risk_adjusted_npv_impact: str = ""


class RedFlag(BaseModel):
    flag: str = ""
    severity: str = ""
    mitigable: bool = True
    mitigation: str = ""


class InvestorStrength(BaseModel):
    strength: str = ""
    evidence: str = ""


class RecommendedAction(BaseModel):
    action: str = ""
    priority: str = ""
    estimated_cost: str = ""
    impact: str = ""


class MarketOpportunity(BaseModel):
    indication: str = ""
    estimated_patient_population: str = ""
    competitive_landscape: str = ""
    peak_revenue_potential: str = ""
    time_to_market_estimate: str = ""


class InvestorReportResponse(BaseModel):
    report_title: str = ""
    generated_date: str = ""
    executive_summary: ExecutiveSummary = ExecutiveSummary()
    regulatory_scorecard: RegulatoryScorecard = RegulatoryScorecard()
    competitive_positioning: CompetitivePositioning = CompetitivePositioning()
    financial_risk_assessment: FinancialRiskAssessment = FinancialRiskAssessment()
    red_flags_for_diligence: list[RedFlag] = []
    strengths_for_investors: list[InvestorStrength] = []
    recommended_actions_before_fundraise: list[RecommendedAction] = []
    market_opportunity: MarketOpportunity = MarketOpportunity()


# ════════════════════════════════════════════════════════════════
# 8. COMPLIANCE WATCHDOG
# ════════════════════════════════════════════════════════════════
class WatchdogAlert(BaseModel):
    update_id: str = ""
    guideline_code: str = ""
    title: str = ""
    published_date: str = ""
    issuing_body: str = ""
    severity: str = ""
    affects_protocol: bool = False
    impact_summary: str = ""
    affected_sections: list[str] = []
    current_compliance: str = ""
    required_changes: list[str] = []
    score_impact: float = 0
    urgency: str = ""
    url: str = ""


class WatchdogAction(BaseModel):
    priority: int = 0
    action: str = ""
    addresses_updates: list[str] = []
    effort: str = ""


class WatchdogResponse(BaseModel):
    alerts: list[WatchdogAlert] = []
    compliance_score_current: float = 0
    compliance_score_adjusted: float = 0
    score_delta: float = 0
    total_affected_updates: int = 0
    critical_alerts: int = 0
    compliance_decay_summary: str = ""
    recommended_priority_actions: list[WatchdogAction] = []


# ════════════════════════════════════════════════════════════════
# SMART CLAUSE LIBRARY
# ════════════════════════════════════════════════════════════════
class SmartClause(BaseModel):
    id: str = ""
    finding_title: str = ""
    section: str = ""
    severity: str = ""
    type: str = ""
    clause_text: str = ""
    suggestion: str = ""
    guideline_refs: list = []
    jurisdictions: list[str] = []


class ClauseLibraryResponse(BaseModel):
    clauses: list[SmartClause] = []
    total: int = 0
    by_severity: dict = {}


# ════════════════════════════════════════════════════════════════
# PORTFOLIO RISK
# ════════════════════════════════════════════════════════════════
class ProtocolRisk(BaseModel):
    id: str = ""
    name: str = ""
    regulator_score: float = 0
    payer_score: float = 0
    global_readiness: float = 0
    findings_count: int = 0
    critical_findings: int = 0
    analyzed_at: str = ""


class PortfolioRiskResponse(BaseModel):
    protocols: list[ProtocolRisk] = []
    portfolio_score: float = 0
    average_regulatory_score: float = 0
    average_payer_score: float = 0
    average_global_readiness: float = 0
    total_protocols: int = 0
    total_critical_findings: int = 0
    attention_needed: list[ProtocolRisk] = []


# ════════════════════════════════════════════════════════════════
# CROSS-PROTOCOL INTELLIGENCE
# ════════════════════════════════════════════════════════════════
class GuidlineCount(BaseModel):
    code: str = ""
    count: int = 0


class SectionCount(BaseModel):
    section: str = ""
    count: int = 0


class CrossProtocolResponse(BaseModel):
    protocols_analyzed: int = 0
    total_findings: int = 0
    average_regulatory_score: float = 0
    average_payer_score: float = 0
    finding_types: dict = {}
    severity_distribution: dict = {}
    most_cited_guidelines: list[GuidlineCount] = []
    most_common_problem_sections: list[SectionCount] = []
    insights: list[str] = []
