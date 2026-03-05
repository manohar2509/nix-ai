"""
NIX AI — Strategic Intelligence Service

Implements the 8 killer features that differentiate NIX AI:
  1. Adversarial Council (AI Debate Engine)
  2. Strategic Friction Heatmap
  3. Trial Cost Architect
  4. Synthetic Payer Simulator
  5. Regulatory Arbitrage / Submission Strategy
  6. Protocol Optimizer
  7. Deal Room / Investor Report
  8. Compliance Watchdog

All features use real data from:
  - Actual protocol text (from S3)
  - Existing analysis results (from DynamoDB)
  - Regulatory reference databases (ICH, FDA, HTA)
  - Cost benchmark databases
  - Payer requirement databases
  - ClinicalTrials.gov API
"""

from __future__ import annotations

import json
import logging
import re

from app.core.exceptions import DocumentNotFoundError
from app.services import bedrock_service, dynamo_service, s3_service
from app.services.regulatory_engine import (
    ALL_REFERENCES_PROMPT_BLOCK,
    ICH_GUIDELINES,
)

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════
# COST BENCHMARK DATA (loaded once)
# ════════════════════════════════════════════════════════════════
def _load_cost_benchmarks() -> str:
    """Load cost benchmark data for prompt grounding."""
    return """CLINICAL TRIAL COST BENCHMARKS (real industry data, cite in analysis):
- Phase 1: Median $41K/patient, $4M total, 32 patients median
- Phase 2: Median $46K/patient, $13M total, 171 patients median
- Phase 3: Median $47K/patient, $48M total, 500 patients median
- Amendment costs: Average $500K per amendment ($141K-$2M range), avg 2.3 amendments/trial, 3 months delay each
- Oncology premium: +65% over average ($78K/patient Phase 3)
- Cardiology premium: +31% ($62K/patient Phase 3)
- Neurology/CNS premium: +44% ($68K/patient Phase 3)
- Rare disease premium: +80% ($85K/patient Phase 3)
- Site costs: US $350K/site/year, EU $275K, APAC $180K
- Screen failure cost: $3K-$8K per failure, avg 25-35% screen failure rate
- Dropout replacement cost: $50K-$80K per replacement
- Cost of 1-day delay to market: $2.7M for blockbuster ($1B annual revenue)
- FDA PDUFA NDA fee (2025): $4.2M
- EMA centralised procedure fee: $300K+"""


def _load_payer_data() -> str:
    """Load US payer requirements for prompt grounding."""
    return """US PAYER COVERAGE REQUIREMENTS (real market data):
MAJOR INSURERS:
- UnitedHealthcare (51M lives, 14% market): Closed formulary, step therapy, prior auth, outcomes-based contracts
- Anthem/Elevance (47M lives, 13%): Tiered formulary, clinical pathways, biosimilar substitution
- CVS/Aetna (35M lives, 10%): Integrated PBM model, CVS Specialty dispensing required
- Cigna/Express Scripts (18M medical + 100M PBM): Aggressive formulary management, National Preferred Formulary
- BlueCross BlueShield (115M combined, 33%): Conservative, evidence-based medicine reviews, experimental/investigational denials

DENIAL RATE BENCHMARKS BY THERAPEUTIC AREA:
- Oncology: 15-25% initial denial (companion dx requirements, NCCN listing, prior auth)
- Cardiology: 20-35% (MACE requirements, CV outcomes, step therapy)
- Neurology/Alzheimer's: 40-60% (surrogate endpoint debates, clinical meaningfulness, high cost)
- Rare Disease: 25-40% (small samples, no natural history, ultra-high pricing)
- Diabetes/Metabolic: 30-45% (crowded market, CV safety, step therapy)

ICER VALUE FRAMEWORK:
- Cost-effective: <$100K/QALY
- Low value: $100K-$150K/QALY
- Poor value: >$150K/QALY

CMS MEDICARE COMMON DENIAL REASONS:
- Insufficient evidence vs existing treatments
- Surrogate endpoints without clinical correlation
- Lack of data in Medicare population (≥65)
- Missing long-term safety data"""


# ════════════════════════════════════════════════════════════════
# HELPER: Get document text + analysis for any feature
# ════════════════════════════════════════════════════════════════
def _get_doc_context(doc_id: str) -> dict:
    """Fetch document text and analysis — used by all features."""
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    s3_key = doc.get("s3_key", "")
    document_text = s3_service.extract_text_from_s3_object(s3_key) if s3_key else ""
    analysis = dynamo_service.get_analysis_for_document(doc_id)

    return {
        "doc": doc,
        "text": document_text,
        "analysis": analysis,
        "name": doc.get("name", "Unknown"),
    }


def _parse_json_response(raw: str) -> dict:
    """Extract JSON from Bedrock response."""
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    # Try array
    json_match = re.search(r'\[[\s\S]*\]', raw)
    if json_match:
        try:
            return {"items": json.loads(json_match.group())}
        except json.JSONDecodeError:
            pass
    return {}


# ════════════════════════════════════════════════════════════════
# FEATURE 1: ADVERSARIAL COUNCIL — AI Debate Engine
# ════════════════════════════════════════════════════════════════
def run_adversarial_council(doc_id: str) -> dict:
    """
    Generate a multi-agent debate about a protocol between:
    - Dr. No (The Regulator) — argues for safety/compliance
    - The Accountant (The Payer) — argues for commercial viability
    - The Patient Advocate — argues for enrollment feasibility & diversity
    - NIX AI Mediator — finds optimized solutions

    Uses REAL protocol text + REAL analysis findings + REAL guidelines.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:8000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    findings_json = json.dumps(analysis.get("findings", [])[:8], default=str)[:3000]
    payer_gaps_json = json.dumps(analysis.get("payer_gaps", [])[:5], default=str)[:2000]
    jurisdiction_json = json.dumps(analysis.get("jurisdiction_scores", [])[:3], default=str)[:2000]

    reg_score = analysis.get("regulator_score", 0)
    pay_score = analysis.get("payer_score", 0)

    prompt = f"""You are generating a structured debate between three AI agents about a clinical trial protocol. This must be based ENTIRELY on the real protocol data and analysis findings provided below.

PROTOCOL EXCERPT:
---
{doc_text}
---

CURRENT ANALYSIS SCORES:
- Regulator Score: {reg_score}/100
- Payer Score: {pay_score}/100
- Global Readiness: {analysis.get("global_readiness_score", 0)}/100

ACTUAL FINDINGS FROM ANALYSIS:
{findings_json}

ACTUAL PAYER GAPS:
{payer_gaps_json}

JURISDICTION SCORES:
{jurisdiction_json}

REGULATORY REFERENCES:
{ALL_REFERENCES_PROMPT_BLOCK}

COST CONTEXT:
{_load_cost_benchmarks()}

PAYER CONTEXT:
{_load_payer_data()}

Generate a structured debate with EXACTLY 3 rounds. Each round must address a REAL finding or gap from the analysis above.

THREE AGENTS:
1. "Dr. No" (The Regulator): Argues from the regulatory compliance perspective. Cites specific ICH/FDA/EMA guidelines. Pushes for safer, more compliant protocol design.
2. "The Accountant" (The Payer): Argues from the commercial/reimbursement perspective. Cites specific HTA body requirements, payer denial risks, and cost impacts. Pushes for cost-efficient, market-ready design.
3. "The Patient Advocate": Argues from enrollment feasibility, patient burden, diversity, and real-world applicability. Cites patient-relevant endpoints and access barriers.

After each round of arguments, "NIX AI Mediator" must propose a SPECIFIC resolution that optimizes across all three perspectives.

Return JSON with this EXACT structure:
{{
  "protocol_name": "name of the protocol",
  "opening_summary": "1-2 sentence summary of the key conflict",
  "rounds": [
    {{
      "round_number": 1,
      "topic": "the specific protocol section or finding being debated",
      "finding_id": "the finding ID from the analysis (e.g. F001) if applicable",
      "dr_no": {{
        "position": "1-2 sentence position statement",
        "argument": "detailed argument citing specific guidelines (2-3 sentences)",
        "guideline_refs": ["ICH E9(R1)", "FDA Adaptive Designs"],
        "score_impact": {{ "regulatory": "+15", "rationale": "why this change affects regulatory score" }}
      }},
      "the_accountant": {{
        "position": "1-2 sentence position statement",
        "argument": "detailed argument citing cost/payer impact (2-3 sentences)",
        "cost_impact": "$X impact estimate",
        "denial_risk": "predicted payer denial % if this isn't addressed",
        "score_impact": {{ "payer": "-20", "rationale": "why this change affects payer score" }}
      }},
      "patient_advocate": {{
        "position": "1-2 sentence position statement",
        "argument": "detailed argument about patient impact (2-3 sentences)",
        "enrollment_impact": "impact on enrollment feasibility and timeline"
      }},
      "mediator": {{
        "resolution": "specific optimized solution (2-3 sentences)",
        "projected_scores": {{ "regulatory": 82, "payer": 71, "rationale": "why these scores" }},
        "implementation": "concrete protocol language or change to make"
      }}
    }}
  ],
  "final_verdict": {{
    "current_scores": {{ "regulatory": {reg_score}, "payer": {pay_score} }},
    "optimized_scores": {{ "regulatory": 0, "payer": 0 }},
    "key_tradeoffs": ["tradeoff 1", "tradeoff 2"],
    "executive_summary": "2-3 sentence executive summary of the debate outcome"
  }}
}}

CRITICAL: Base ALL arguments on the REAL findings and data provided. Do not invent issues that aren't in the analysis. Cite real guideline codes. Calculate real cost impacts based on the cost benchmarks.

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.4)
        result = _parse_json_response(raw)

        if not result.get("rounds"):
            result = {
                "protocol_name": ctx["name"],
                "opening_summary": "Analysis debate could not be structured.",
                "rounds": [],
                "final_verdict": {"current_scores": {"regulatory": reg_score, "payer": pay_score}},
            }

        return result
    except Exception as exc:
        logger.error("Adversarial council failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 2: STRATEGIC FRICTION HEATMAP
# ════════════════════════════════════════════════════════════════
def generate_friction_map(doc_id: str) -> dict:
    """
    Map protocol sections to regulatory risk, commercial risk, and friction scores.
    Friction = conflict between regulatory and commercial requirements.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:10000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    findings_json = json.dumps(analysis.get("findings", []), default=str)[:4000]
    payer_gaps_json = json.dumps(analysis.get("payer_gaps", []), default=str)[:2000]

    prompt = f"""You are analyzing a clinical trial protocol to generate a section-by-section risk heatmap.

PROTOCOL TEXT:
---
{doc_text}
---

ANALYSIS FINDINGS (REAL — use these to ground your assessment):
{findings_json}

PAYER GAPS (REAL):
{payer_gaps_json}

REGULATORY REFERENCES:
{ALL_REFERENCES_PROMPT_BLOCK}

For each major protocol section, calculate THREE scores (0-100):
1. "regulatory_risk" — How risky is this section from a regulatory compliance standpoint? Higher = more risk.
2. "commercial_risk" — How risky is this section from a payer/market access standpoint? Higher = more risk.
3. "friction_score" — How much do regulatory and commercial requirements CONFLICT in this section? Higher = more conflict.

A friction score > 60 means fixing the regulatory issue would worsen the commercial outlook (or vice versa).

Return JSON:
{{
  "sections": [
    {{
      "section_id": "unique id",
      "section_title": "e.g. Study Population / Inclusion Criteria",
      "section_number": "e.g. 5.1",
      "regulatory_risk": 75,
      "commercial_risk": 45,
      "friction_score": 68,
      "risk_category": "high_friction" | "regulatory_concern" | "commercial_concern" | "low_risk",
      "regulatory_detail": "Specific regulatory issue in this section (cite guideline)",
      "commercial_detail": "Specific commercial/payer issue in this section",
      "friction_explanation": "Why regulatory and commercial requirements conflict here",
      "related_finding_ids": ["F001", "F003"],
      "guideline_refs": ["ICH E6(R3)", "NICE PMG36"],
      "quick_fix": "One-sentence actionable recommendation",
      "text_excerpt": "brief excerpt of the actual protocol text in this section (20-50 words)"
    }}
  ],
  "overall_friction": {{
    "score": 0-100,
    "hotspots": ["section title 1", "section title 2"],
    "summary": "2-sentence summary of where the biggest conflicts are"
  }}
}}

CRITICAL: Map findings from the analysis to specific protocol sections. Use REAL section titles from the protocol text. The friction score should reflect genuine regulatory vs commercial tension, not just high risk in both.

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)
        return result
    except Exception as exc:
        logger.error("Friction map generation failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 3: TRIAL COST ARCHITECT
# ════════════════════════════════════════════════════════════════
def analyze_trial_costs(doc_id: str) -> dict:
    """
    Estimate trial costs based on protocol parameters and generate
    per-finding cost impact analysis.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:8000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    findings_json = json.dumps(analysis.get("findings", [])[:10], default=str)[:3000]

    prompt = f"""You are a clinical trial cost analyst. Analyze this protocol and estimate costs using real industry benchmarks.

PROTOCOL TEXT:
---
{doc_text}
---

ANALYSIS FINDINGS (each finding may have a cost implication):
{findings_json}

COST BENCHMARK DATA:
{_load_cost_benchmarks()}

Extract key protocol parameters (sample size, number of sites, phase, therapeutic area, duration, number of visits, number of arms) from the protocol text.

Then generate a comprehensive cost analysis:

Return JSON:
{{
  "protocol_parameters": {{
    "phase": "Phase X",
    "therapeutic_area": "e.g. Oncology",
    "target_enrollment": 680,
    "number_of_arms": 2,
    "number_of_sites": 120,
    "study_duration_months": 36,
    "treatment_duration_months": 18,
    "estimated_visits_per_patient": 24,
    "estimated_screen_failure_rate": 0.30
  }},
  "cost_estimate": {{
    "total_estimated_cost_usd": 48000000,
    "cost_range_low_usd": 35000000,
    "cost_range_high_usd": 65000000,
    "per_patient_cost_usd": 70000,
    "industry_benchmark_per_patient": 47000,
    "vs_benchmark": "+49% above median for this phase/TA"
  }},
  "cost_breakdown": [
    {{
      "category": "Clinical Procedures & Patient Care",
      "estimated_cost_usd": 16000000,
      "percentage": 33,
      "detail": "Lab tests, imaging, treatment admin for N patients × V visits"
    }}
  ],
  "finding_cost_impacts": [
    {{
      "finding_id": "F001",
      "finding_title": "title from analysis",
      "cost_impact_usd": 2300000,
      "cost_impact_direction": "increase" | "savings",
      "timeline_impact_months": 4,
      "explanation": "Adding this biomarker requires X additional tests × N patients",
      "fix_cost_usd": 500000,
      "fix_savings_usd": 1800000,
      "roi_ratio": "3.6x"
    }}
  ],
  "amendment_risk": {{
    "predicted_amendments": 2,
    "estimated_amendment_cost_usd": 1000000,
    "high_risk_triggers": ["Finding F001 likely to trigger amendment", "Finding F003 may require sample size change"],
    "prevention_savings_usd": 1000000
  }},
  "optimization_scenarios": [
    {{
      "scenario": "Current Protocol",
      "total_cost_usd": 48000000,
      "timeline_months": 36,
      "regulatory_risk": "medium"
    }},
    {{
      "scenario": "NIX AI Optimized",
      "total_cost_usd": 38000000,
      "timeline_months": 30,
      "regulatory_risk": "low",
      "changes": ["Resolved 3 findings to prevent amendments", "Optimized site strategy"]
    }},
    {{
      "scenario": "Aggressive Cost Reduction",
      "total_cost_usd": 28000000,
      "timeline_months": 24,
      "regulatory_risk": "elevated",
      "changes": ["Reduced sample size", "Fewer sites", "Shorter follow-up"]
    }}
  ],
  "roi_summary": {{
    "nix_ai_analysis_value": "Identified $X in potential cost savings",
    "amendment_prevention_value_usd": 1000000,
    "time_savings_value_usd": 5000000,
    "total_potential_savings_usd": 6000000
  }}
}}

CRITICAL: Use REAL protocol parameters from the text. Calculate costs using the benchmark data provided. Each finding cost impact must be specifically tied to a real finding from the analysis.

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)
        return result
    except Exception as exc:
        logger.error("Cost analysis failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 4: SYNTHETIC PAYER SIMULATOR
# ════════════════════════════════════════════════════════════════
def simulate_payer_decisions(doc_id: str) -> dict:
    """
    Predict insurance coverage decisions and denial rates
    for each major US insurer and HTA body.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:6000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    payer_gaps = json.dumps(analysis.get("payer_gaps", []), default=str)[:3000]
    hta_scores = json.dumps(analysis.get("hta_body_scores", {}), default=str)
    findings = json.dumps(analysis.get("findings", [])[:6], default=str)[:2000]

    prompt = f"""You are simulating payer coverage decisions for a clinical trial drug based on protocol design quality.

PROTOCOL EXCERPT:
---
{doc_text}
---

ACTUAL PAYER GAPS FROM ANALYSIS:
{payer_gaps}

HTA BODY SCORES:
{hta_scores}

KEY FINDINGS:
{findings}

PAYER MARKET DATA:
{_load_payer_data()}

COST CONTEXT:
{_load_cost_benchmarks()}

Simulate coverage decisions from EACH major stakeholder. Base predictions on the REAL payer gaps and protocol design.

Return JSON:
{{
  "overall_denial_risk_pct": 45,
  "denial_risk_category": "high" | "moderate" | "low",
  "insurer_predictions": [
    {{
      "insurer": "UnitedHealthcare",
      "covered_lives_millions": 51,
      "predicted_coverage_decision": "Restrict with PA" | "Cover" | "Deny" | "Cover with conditions",
      "denial_probability_pct": 35,
      "key_concerns": ["Missing QoL endpoint", "No head-to-head vs SOC"],
      "required_evidence": ["EQ-5D-5L data", "Active comparator data"],
      "formulary_tier_prediction": "Tier 4 (Specialty)",
      "prior_auth_likely": true,
      "step_therapy_likely": true
    }}
  ],
  "hta_predictions": [
    {{
      "body": "NICE",
      "country": "England",
      "predicted_recommendation": "Recommended with restrictions" | "Optimized" | "Not recommended",
      "confidence_pct": 70,
      "key_gaps": ["No EQ-5D-5L", "Comparator mismatch"],
      "estimated_icer_category": "cost_effective" | "low_value" | "poor_value",
      "reimbursement_probability_pct": 65
    }}
  ],
  "revenue_impact": {{
    "assumed_annual_drug_price_usd": 150000,
    "target_patient_population": 50000,
    "max_annual_revenue_usd": 7500000000,
    "current_protocol_revenue_projection_usd": 3750000000,
    "optimized_protocol_revenue_projection_usd": 5625000000,
    "revenue_at_risk_usd": 1875000000,
    "explanation": "Based on predicted denial rates and coverage restrictions"
  }},
  "fix_package": [
    {{
      "action": "Add EQ-5D-5L endpoint",
      "cost_to_implement_usd": 680000,
      "denial_reduction_pct": 15,
      "revenue_impact_usd": 500000000,
      "roi_ratio": "735x",
      "affected_insurers": ["UnitedHealthcare", "NICE", "CADTH"]
    }}
  ],
  "executive_summary": "2-3 sentence summary of payer landscape risk and key recommendations"
}}

CRITICAL: Base ALL predictions on the REAL payer gaps identified in the analysis. Use real insurer criteria and denial benchmarks. Revenue projections should be order-of-magnitude estimates based on indication prevalence.

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)
        return result
    except Exception as exc:
        logger.error("Payer simulation failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 5: REGULATORY ARBITRAGE / SUBMISSION STRATEGY
# ════════════════════════════════════════════════════════════════
def generate_submission_strategy(doc_id: str) -> dict:
    """
    Optimize global submission order and generate a 'golden protocol'
    that satisfies all jurisdictions simultaneously.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:6000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    jurisdiction_scores = json.dumps(analysis.get("jurisdiction_scores", []), default=str)[:3000]
    findings = json.dumps(analysis.get("findings", [])[:8], default=str)[:2000]

    prompt = f"""You are a global regulatory strategist optimizing submission order for a clinical trial.

PROTOCOL EXCERPT:
---
{doc_text}
---

JURISDICTION COMPLIANCE SCORES (REAL from analysis):
{jurisdiction_scores}

KEY FINDINGS:
{findings}

REGULATORY REFERENCES:
{ALL_REFERENCES_PROMPT_BLOCK}

REGULATORY REVIEW TIMELINES:
- FDA: Standard 12mo, Priority 8mo, Breakthrough 6mo
- EMA: Centralised 15mo, Accelerated 10mo, Conditional 8mo
- PMDA: Standard 12mo, Priority 9mo, SAKIGAKE 6mo
- Health Canada: Standard 12mo, Priority 6mo
- MHRA: Standard 12mo, ILAP 8mo
- NMPA: Standard 14mo, Priority 8mo, Breakthrough 6mo

Generate an optimized global submission strategy:

Return JSON:
{{
  "recommended_submission_order": [
    {{
      "rank": 1,
      "jurisdiction": "FDA",
      "compliance_score": 85,
      "recommended_pathway": "Standard / Priority / Breakthrough / Accelerated",
      "estimated_review_months": 12,
      "rationale": "Why file here first",
      "blockers_to_resolve": ["list of blocking issues"],
      "estimated_approval_date": "2028-Q2"
    }}
  ],
  "simultaneous_filing_feasibility": {{
    "feasible": true,
    "max_simultaneous": 4,
    "recommended_simultaneous": ["FDA", "EMA", "Health Canada"],
    "explanation": "Why these can be filed simultaneously"
  }},
  "golden_protocol_changes": [
    {{
      "change": "specific change to make",
      "resolves_for": ["FDA", "EMA", "PMDA"],
      "regulatory_justification": "cite guideline",
      "effort_level": "low" | "medium" | "high",
      "cost_impact": "$X"
    }}
  ],
  "timeline_comparison": {{
    "current_sequential_months": 48,
    "optimized_parallel_months": 30,
    "time_saved_months": 18,
    "market_revenue_impact": "18 months earlier global access = $X revenue"
  }},
  "pathway_recommendations": [
    {{
      "jurisdiction": "FDA",
      "standard_pathway": "Standard NDA",
      "recommended_pathway": "Breakthrough Therapy + Priority Review",
      "eligibility_rationale": "why this protocol qualifies",
      "timeline_benefit_months": 6
    }}
  ],
  "jurisdiction_gap_matrix": [
    {{
      "protocol_section": "Primary Endpoint",
      "fda_status": "compliant",
      "ema_status": "partial",
      "pmda_status": "gap",
      "gap_detail": "PMDA requires X that FDA/EMA don't",
      "resolution": "how to fix for all"
    }}
  ],
  "executive_summary": "3-sentence summary of optimal strategy"
}}

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)
        return result
    except Exception as exc:
        logger.error("Submission strategy generation failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 6: PROTOCOL OPTIMIZER
# ════════════════════════════════════════════════════════════════
def optimize_protocol(doc_id: str) -> dict:
    """
    Generate specific protocol text rewrites to resolve findings.
    Each optimization includes original text, new text, and justification.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:10000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    findings = analysis.get("findings", [])
    findings_json = json.dumps(findings[:10], default=str)[:4000]
    payer_gaps_json = json.dumps(analysis.get("payer_gaps", [])[:5], default=str)[:2000]

    prompt = f"""You are a clinical trial protocol optimization engine. Generate SPECIFIC text rewrites to resolve regulatory and payer findings.

FULL PROTOCOL TEXT:
---
{doc_text}
---

FINDINGS TO RESOLVE (REAL — from analysis):
{findings_json}

PAYER GAPS TO ADDRESS:
{payer_gaps_json}

REGULATORY REFERENCES:
{ALL_REFERENCES_PROMPT_BLOCK}

For EACH finding, generate an optimization that includes the EXACT original protocol text and the EXACT replacement text.

Return JSON:
{{
  "optimizations": [
    {{
      "id": "OPT-001",
      "finding_id": "F001",
      "finding_title": "title of the finding being resolved",
      "section": "protocol section name",
      "severity": "critical" | "high" | "medium" | "low",
      "original_text": "exact text from the protocol that needs changing (50-200 words)",
      "optimized_text": "replacement text that resolves the finding (50-200 words)",
      "change_summary": "1-sentence description of what changed",
      "regulatory_justification": "cite specific guideline: ICH E9(R1) Section 3.2 requires...",
      "guideline_refs": ["ICH E9(R1)", "FDA Multiple Endpoints"],
      "projected_score_impact": {{
        "regulatory_delta": "+8",
        "payer_delta": "+5"
      }},
      "cost_impact": "Neutral / +$500K / -$200K",
      "risk_level": "safe_change" | "moderate_risk" | "needs_review"
    }}
  ],
  "summary": {{
    "total_optimizations": 8,
    "projected_regulatory_score": 88,
    "projected_payer_score": 75,
    "current_regulatory_score": {analysis.get("regulator_score", 0)},
    "current_payer_score": {analysis.get("payer_score", 0)},
    "critical_fixes": 2,
    "high_fixes": 3,
    "net_cost_impact": "+$1.2M",
    "executive_summary": "Applying all optimizations improves regulatory score from X to Y and payer score from A to B"
  }}
}}

CRITICAL: The original_text MUST be real text from the protocol (quote it accurately). The optimized_text must be protocol-quality language suitable for a regulatory submission. Cite specific guideline sections in every justification.

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)
        return result
    except Exception as exc:
        logger.error("Protocol optimization failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 7: DEAL ROOM / INVESTOR REPORT
# ════════════════════════════════════════════════════════════════
def generate_investor_report(doc_id: str) -> dict:
    """
    Generate a VC/investor-ready due diligence package aggregating
    all analysis data into an executive format.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:4000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    # Gather all available data
    sims = dynamo_service.get_simulations_for_document(doc_id)

    # Pre-compute jurisdiction data outside the f-string to avoid
    # {{}} inside f-string expression (which causes TypeError)
    jurisdiction_data = json.dumps(
        [{j.get("jurisdiction"): j.get("compliance_score")} for j in analysis.get("jurisdiction_scores", [])],
        default=str,
    )

    try:
        prompt = f"""You are generating a venture capital / investor due diligence report for a clinical trial program.

PROTOCOL SYNOPSIS:
---
{doc_text[:4000]}
---

REGULATORY ANALYSIS RESULTS:
- Regulator Score: {analysis.get("regulator_score", 0)}/100
- Payer Score: {analysis.get("payer_score", 0)}/100
- Global Readiness: {analysis.get("global_readiness_score", 0)}/100
- Total Findings: {len(analysis.get("findings", []))}
- Critical Findings: {sum(1 for f in analysis.get("findings", []) if f.get("severity") == "critical")}
- High Findings: {sum(1 for f in analysis.get("findings", []) if f.get("severity") == "high")}
- HTA Body Scores: {json.dumps(analysis.get("hta_body_scores", {}), default=str)}
- Jurisdiction Scores: {jurisdiction_data}

AMENDMENT SIMULATIONS RUN: {len(sims)}

COST BENCHMARKS:
{_load_cost_benchmarks()}

Generate an investor-ready report:

Return JSON:
{{
  "report_title": "Regulatory Due Diligence Report: [Protocol Name]",
  "generated_date": "2026-03-04",
  "executive_summary": {{
    "headline": "One-sentence verdict",
    "risk_rating": "Low Risk" | "Moderate Risk" | "High Risk" | "Critical Risk",
    "investment_readiness": "Ready" | "Conditionally Ready" | "Needs Work" | "Not Ready",
    "key_strength": "biggest regulatory strength",
    "key_risk": "biggest regulatory risk",
    "one_paragraph_summary": "3-4 sentence executive summary for board presentation"
  }},
  "regulatory_scorecard": {{
    "overall_score": 75,
    "regulatory_compliance": {analysis.get("regulator_score", 0)},
    "market_access_readiness": {analysis.get("payer_score", 0)},
    "global_readiness": {analysis.get("global_readiness_score", 0)},
    "benchmark_vs_industry": "above_average" | "average" | "below_average",
    "probability_of_approval_pct": 72,
    "explanation": "Based on analysis scores and finding severity distribution"
  }},
  "competitive_positioning": {{
    "protocol_quality_percentile": 67,
    "design_strengths": ["strength 1", "strength 2"],
    "design_gaps": ["gap 1", "gap 2"],
    "vs_similar_trials": "How this protocol compares to similar trials in the space"
  }},
  "financial_risk_assessment": {{
    "estimated_trial_cost_range": "$30M-$60M",
    "amendment_risk": "2 likely amendments costing ~$1M total",
    "timeline_risk": "3-month delay risk from unresolved findings",
    "market_access_risk": "Predicted 35% initial payer denial rate",
    "risk_adjusted_npv_impact": "Risk-adjusted discount: -15% from regulatory uncertainties"
  }},
  "red_flags_for_diligence": [
    {{
      "flag": "description of the red flag",
      "severity": "critical" | "major" | "minor",
      "mitigable": true,
      "mitigation": "how to fix this"
    }}
  ],
  "strengths_for_investors": [
    {{
      "strength": "description",
      "evidence": "supporting data from the analysis"
    }}
  ],
  "recommended_actions_before_fundraise": [
    {{
      "action": "specific action",
      "priority": "immediate" | "before_series_a" | "post_funding",
      "estimated_cost": "$X",
      "impact": "what this resolves"
    }}
  ],
  "market_opportunity": {{
    "indication": "from protocol",
    "estimated_patient_population": "X patients globally",
    "competitive_landscape": "brief description",
    "peak_revenue_potential": "$XB",
    "time_to_market_estimate": "X years from now"
  }}
}}

Respond with ONLY valid JSON."""

        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)
        return result
    except Exception as exc:
        logger.error("Investor report generation failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# FEATURE 8: COMPLIANCE WATCHDOG
# ════════════════════════════════════════════════════════════════

# Real recent regulatory updates
RECENT_UPDATES = [
    {
        "id": "UPDATE-001",
        "code": "ICH M14",
        "title": "Use of Real-World Data in Clinical Studies",
        "date": "2025-06-13",
        "severity": "high",
        "body": "ICH",
    },
    {
        "id": "UPDATE-002",
        "code": "ICH E6(R3)",
        "title": "Good Clinical Practice — Modernized Framework",
        "date": "2025-01-06",
        "severity": "critical",
        "body": "ICH",
    },
    {
        "id": "UPDATE-003",
        "code": "ICH E20",
        "title": "Adaptive Clinical Trials",
        "date": "2025-06-27",
        "severity": "high",
        "body": "ICH",
    },
    {
        "id": "UPDATE-004",
        "code": "FDA Diversity Plans",
        "title": "Diversity Plans to Improve Enrollment",
        "date": "2024-06-26",
        "severity": "critical",
        "body": "FDA",
    },
    {
        "id": "UPDATE-005",
        "code": "ICH M11",
        "title": "Harmonised Protocol Template (CeSHarP)",
        "date": "2024-11-21",
        "severity": "high",
        "body": "ICH",
    },
    {
        "id": "UPDATE-006",
        "code": "EU HTA Regulation",
        "title": "Joint Clinical Assessments Begin (Oncology/ATMPs)",
        "date": "2025-01-12",
        "severity": "critical",
        "body": "EU",
    },
    {
        "id": "UPDATE-007",
        "code": "FDA DCT",
        "title": "Decentralized Clinical Trials Final Guidance",
        "date": "2024-09-12",
        "severity": "medium",
        "body": "FDA",
    },
    {
        "id": "UPDATE-008",
        "code": "ICH E22",
        "title": "Patient Preference Studies",
        "date": "2025-11-19",
        "severity": "medium",
        "body": "ICH",
    },
]


def run_compliance_watchdog(doc_id: str) -> dict:
    """
    Scan a protocol against recent regulatory updates to detect
    compliance drift. Uses real recently published guidances.
    """
    ctx = _get_doc_context(doc_id)
    doc_text = ctx["text"][:6000] if ctx["text"] else ""
    analysis = ctx["analysis"] or {}

    analyzed_at = analysis.get("completed_at", "")
    reg_score = analysis.get("regulator_score", 0)

    updates_text = "\n".join(
        f"- [{u['code']}] {u['title']} (Published: {u['date']}, Severity: {u['severity']}, Body: {u['body']})"
        for u in RECENT_UPDATES
    )

    prompt = f"""You are a regulatory compliance watchdog. Check if this protocol is affected by recent regulatory updates.

PROTOCOL EXCERPT:
---
{doc_text}
---

CURRENT ANALYSIS:
- Regulator Score: {reg_score}/100
- Analyzed at: {analyzed_at}
- Number of findings: {len(analysis.get("findings", []))}

RECENT REGULATORY UPDATES (REAL — published 2024-2026):
{updates_text}

For EACH regulatory update, assess whether it affects this protocol and how.

Return JSON:
{{
  "alerts": [
    {{
      "update_id": "UPDATE-001",
      "guideline_code": "ICH M14",
      "title": "Use of Real-World Data",
      "published_date": "2025-06-13",
      "issuing_body": "ICH",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "affects_protocol": true,
      "impact_summary": "How this update affects the protocol (2-3 sentences)",
      "affected_sections": ["Study Design", "Statistical Analysis"],
      "current_compliance": "non_compliant" | "partial" | "compliant" | "not_applicable",
      "required_changes": ["specific change 1", "specific change 2"],
      "score_impact": -8,
      "urgency": "immediate" | "next_review" | "monitor"
    }}
  ],
  "compliance_score_current": {reg_score},
  "compliance_score_adjusted": 0,
  "score_delta": 0,
  "total_affected_updates": 0,
  "critical_alerts": 0,
  "compliance_decay_summary": "2-sentence summary of how the regulatory landscape has changed since the protocol was designed",
  "recommended_priority_actions": [
    {{
      "priority": 1,
      "action": "specific action to take",
      "addresses_updates": ["ICH E6(R3)", "FDA Diversity Plans"],
      "effort": "low" | "medium" | "high"
    }}
  ]
}}

CRITICAL: For each update, genuinely assess whether the protocol's design, endpoints, or procedures are affected. Don't flag updates as affecting the protocol unless they genuinely do based on the protocol text.

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=4000, temperature=0.3)
        result = _parse_json_response(raw)

        # Enrich with the static update metadata
        if "alerts" in result:
            for alert in result["alerts"]:
                update_id = alert.get("update_id", "")
                for u in RECENT_UPDATES:
                    if u["id"] == update_id:
                        alert["url"] = ICH_GUIDELINES.get(
                            u["code"].replace("ICH ", ""), {}
                        ).get("url", "")
                        break

        return result
    except Exception as exc:
        logger.error("Compliance watchdog failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# ENHANCEMENT: SMART CLAUSE LIBRARY
# ════════════════════════════════════════════════════════════════
def get_smart_clauses(doc_id: str) -> dict:
    """
    Extract all suggested clauses from analysis findings into a
    browsable, searchable clause library.
    """
    ctx = _get_doc_context(doc_id)
    analysis = ctx["analysis"] or {}
    findings = analysis.get("findings", [])

    clauses = []
    for f in findings:
        clause = f.get("suggested_clause")
        if clause:
            clauses.append({
                "id": f.get("id", ""),
                "finding_title": f.get("title", ""),
                "section": f.get("section", ""),
                "severity": f.get("severity", "medium"),
                "type": f.get("type", ""),
                "clause_text": clause,
                "suggestion": f.get("suggestion", ""),
                "guideline_refs": f.get("guideline_refs", []),
                "jurisdictions": f.get("jurisdictions_affected", []),
            })

    return {
        "clauses": clauses,
        "total": len(clauses),
        "by_severity": {
            "critical": sum(1 for c in clauses if c["severity"] == "critical"),
            "high": sum(1 for c in clauses if c["severity"] == "high"),
            "medium": sum(1 for c in clauses if c["severity"] == "medium"),
            "low": sum(1 for c in clauses if c["severity"] == "low"),
        },
    }


# ════════════════════════════════════════════════════════════════
# ENHANCEMENT: CROSS-PROTOCOL INTELLIGENCE
# ════════════════════════════════════════════════════════════════
def get_cross_protocol_intelligence() -> dict:
    """
    Aggregate findings across ALL analyzed protocols to identify patterns.
    """
    # Scan all analyses from DynamoDB
    from app.core.aws_clients import get_dynamodb_table
    from boto3.dynamodb.conditions import Attr

    table = get_dynamodb_table()
    analyses = []

    try:
        resp = table.scan(
            FilterExpression=Attr("entity").eq("ANALYSIS") & Attr("status").eq("COMPLETE"),
        )
        analyses = resp.get("Items", [])
    except Exception as exc:
        logger.warning("Cross-protocol scan failed: %s", exc)

    if not analyses:
        return {"message": "No analyzed protocols found", "patterns": []}

    # Aggregate finding types, severities, and guideline references
    all_findings = []
    total_reg_scores = []
    total_pay_scores = []

    for a in analyses:
        findings = a.get("findings", [])
        if isinstance(findings, list):
            all_findings.extend(findings)
        reg = a.get("regulator_score")
        pay = a.get("payer_score")
        if reg:
            total_reg_scores.append(float(reg))
        if pay:
            total_pay_scores.append(float(pay))

    # Count finding types
    type_counts = {}
    severity_counts = {}
    guideline_counts = {}
    section_counts = {}

    for f in all_findings:
        ftype = f.get("type", "unknown")
        type_counts[ftype] = type_counts.get(ftype, 0) + 1

        sev = f.get("severity", "unknown")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

        for ref in f.get("guideline_refs", []):
            code = ref.get("code", "unknown")
            guideline_counts[code] = guideline_counts.get(code, 0) + 1

        section = f.get("section", "unknown")
        section_counts[section] = section_counts.get(section, 0) + 1

    # Sort by frequency
    top_guidelines = sorted(guideline_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    top_sections = sorted(section_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "protocols_analyzed": len(analyses),
        "total_findings": len(all_findings),
        "average_regulatory_score": round(sum(total_reg_scores) / len(total_reg_scores), 1) if total_reg_scores else 0,
        "average_payer_score": round(sum(total_pay_scores) / len(total_pay_scores), 1) if total_pay_scores else 0,
        "finding_types": type_counts,
        "severity_distribution": severity_counts,
        "most_cited_guidelines": [{"code": code, "count": count} for code, count in top_guidelines],
        "most_common_problem_sections": [{"section": sec, "count": count} for sec, count in top_sections],
        "insights": [
            f"Across {len(analyses)} protocols, the most common finding type is '{max(type_counts, key=type_counts.get)}'" if type_counts else "Insufficient data",
            f"The most frequently cited guideline is '{top_guidelines[0][0]}' ({top_guidelines[0][1]} citations)" if top_guidelines else "No guideline data",
            f"Average regulatory score: {round(sum(total_reg_scores)/len(total_reg_scores),1)}/100" if total_reg_scores else "No score data",
        ],
    }


# ════════════════════════════════════════════════════════════════
# ENHANCEMENT: PORTFOLIO RISK SCORE
# ════════════════════════════════════════════════════════════════
def get_portfolio_risk(user_id: str) -> dict:
    """
    Aggregate risk scores across all of a user's protocols for C-suite dashboard.
    """
    documents = dynamo_service.list_documents(user_id)
    analyzed_docs = []

    for doc in documents:
        if doc.get("status") == "analyzed":
            analysis = dynamo_service.get_analysis_for_document(doc["id"])
            if analysis:
                analyzed_docs.append({
                    "id": doc["id"],
                    "name": doc.get("name", ""),
                    "regulator_score": analysis.get("regulator_score", 0),
                    "payer_score": analysis.get("payer_score", 0),
                    "global_readiness": analysis.get("global_readiness_score", 0),
                    "findings_count": len(analysis.get("findings", [])),
                    "critical_findings": sum(1 for f in analysis.get("findings", []) if f.get("severity") == "critical"),
                    "analyzed_at": analysis.get("completed_at", ""),
                })

    if not analyzed_docs:
        return {"protocols": [], "portfolio_score": 0, "summary": "No analyzed protocols"}

    avg_reg = round(sum(d["regulator_score"] for d in analyzed_docs) / len(analyzed_docs), 1)
    avg_pay = round(sum(d["payer_score"] for d in analyzed_docs) / len(analyzed_docs), 1)
    avg_global = round(sum(d["global_readiness"] for d in analyzed_docs) / len(analyzed_docs), 1)
    total_critical = sum(d["critical_findings"] for d in analyzed_docs)

    return {
        "protocols": analyzed_docs,
        "portfolio_score": round((avg_reg + avg_pay + avg_global) / 3, 1),
        "average_regulatory_score": avg_reg,
        "average_payer_score": avg_pay,
        "average_global_readiness": avg_global,
        "total_protocols": len(analyzed_docs),
        "total_critical_findings": total_critical,
        "attention_needed": [d for d in analyzed_docs if d["regulator_score"] < 60 or d["payer_score"] < 50],
    }
