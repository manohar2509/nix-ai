"""
NIX AI — Regulatory Intelligence Engine

Extended Bedrock prompts for:
  REQ-1: ICH Guideline Cross-Reference
  REQ-2: Multi-Jurisdiction Compass
  REQ-3: Amendment Impact Simulation
  REQ-5: Payer Evidence Gap Analysis
  REQ-6: Protocol Comparison
  REQ-7: Smart Clause Generation
  REQ-10: Benchmarking Analysis

All functions use the Bedrock Converse API via bedrock_service.invoke_model().
"""

from __future__ import annotations

import json
import logging
import re

from app.services import bedrock_service

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════════
# ICH GUIDELINE REFERENCE DATABASE (for prompt grounding)
# ════════════════════════════════════════════════════════════════
ICH_GUIDELINES = {
    # ── Efficacy (E-series) ──────────────────────────────────────
    "E1":      {"title": "Population Exposure Assessment", "url": "https://database.ich.org/sites/default/files/E1_Guideline.pdf", "focus": "Safety database size, long-term exposure requirements"},
    "E2A":     {"title": "Clinical Safety Data Management", "url": "https://database.ich.org/sites/default/files/E2A_Guideline.pdf", "focus": "AE definitions, expedited reporting, safety signals"},
    "E2F":     {"title": "Development Safety Update Report", "url": "https://database.ich.org/sites/default/files/E2F_Guideline.pdf", "focus": "DSUR format, periodic safety reporting during development"},
    "E3":      {"title": "Clinical Study Reports", "url": "https://database.ich.org/sites/default/files/E3_Guideline.pdf", "focus": "CSR structure, appendices, data presentation"},
    "E4":      {"title": "Dose-Response Information", "url": "https://database.ich.org/sites/default/files/E4_Guideline.pdf", "focus": "Dose selection, dose-response, PK/PD relationships"},
    "E5(R1)":  {"title": "Ethnic Factors / Bridging Studies", "url": "https://database.ich.org/sites/default/files/E5_R1__Guideline.pdf", "focus": "Ethnic sensitivity, bridging data, foreign data acceptance"},
    "E6(R3)":  {"title": "Good Clinical Practice (GCP)", "url": "https://database.ich.org/sites/default/files/ICH_E6%28R3%29_Step4_FinalGuideline_2025_0106_ErrorCorrections_2025_1024.pdf", "focus": "Trial conduct, quality, data integrity, informed consent"},
    "E7":      {"title": "Geriatric Populations", "url": "https://database.ich.org/sites/default/files/E7_Guideline.pdf", "focus": "Elderly inclusion, age-specific considerations"},
    "E8(R1)":  {"title": "General Considerations for Clinical Studies", "url": "https://database.ich.org/sites/default/files/ICH_E8-R1_Guideline_Step4_2021_1006.pdf", "focus": "Study design, quality factors, study types"},
    "E9(R1)":  {"title": "Statistical Principles / Estimands", "url": "https://database.ich.org/sites/default/files/E9-R1_Step4_Guideline_2019_1203.pdf", "focus": "Statistical analysis plan, estimands, sensitivity analysis"},
    "E10":     {"title": "Choice of Control Group", "url": "https://database.ich.org/sites/default/files/E10_Guideline.pdf", "focus": "Active vs placebo controls, non-inferiority"},
    "E11(R1)": {"title": "Pediatric Populations", "url": "https://database.ich.org/sites/default/files/E11_R1_Addendum.pdf", "focus": "Pediatric development, extrapolation, age groups"},
    "E14":     {"title": "QT/QTc Interval Assessment", "url": "https://database.ich.org/sites/default/files/E14_Guideline.pdf", "focus": "Cardiac safety, thorough QT study, concentration-response"},
    "E17":     {"title": "Multi-Regional Clinical Trials", "url": "https://database.ich.org/sites/default/files/E17EWG_Step4_2017_1116.pdf", "focus": "Global trial design, regional sample sizes, ethnic factors"},
    "E19":     {"title": "Selective Safety Data Collection", "url": "https://database.ich.org/sites/default/files/ICH_E19_Guideline_Step4_2022_0826_0.pdf", "focus": "Streamlined safety data collection in late-stage trials"},
    "E20":     {"title": "Adaptive Designs for Clinical Trials", "url": "https://database.ich.org/sites/default/files/ICH_E20EWG_Step3_DraftGuideline_2025_0627.pdf", "focus": "Adaptive designs, interim analyses, type I error control"},
    "E22":     {"title": "Patient Preference Studies", "url": "https://database.ich.org/sites/default/files/ICH_E22_Step2_draftGuideline_Assembly_Endorsed_FINAL_2025_1119.pdf", "focus": "Patient preference information, benefit-risk assessment"},
    # ── Safety (S-series) ────────────────────────────────────────
    "S1A":     {"title": "Carcinogenicity — Need for Studies", "url": "https://database.ich.org/sites/default/files/S1A_Guideline.pdf", "focus": "When carcinogenicity studies are needed"},
    "S2(R1)":  {"title": "Genotoxicity Testing", "url": "https://database.ich.org/sites/default/files/S2%28R1%29_Guideline.pdf", "focus": "Standard battery of genotoxicity tests"},
    "S5(R3)":  {"title": "Reproductive Toxicology", "url": "https://database.ich.org/sites/default/files/S5-R3_Step4_Guideline_2020_0218.pdf", "focus": "Fertility, embryo-fetal, pre/postnatal development"},
    "S6(R1)":  {"title": "Preclinical Safety — Biotechnology Products", "url": "https://database.ich.org/sites/default/files/S6_R1_Addendum_Step4.pdf", "focus": "Safety evaluation of biotechnology-derived pharmaceuticals"},
    "S7A":     {"title": "Safety Pharmacology — Core Battery", "url": "https://database.ich.org/sites/default/files/S7A_Guideline.pdf", "focus": "CV, CNS, respiratory safety pharmacology"},
    "S7B":     {"title": "Non-clinical QT Evaluation", "url": "https://database.ich.org/sites/default/files/S7B_Guideline.pdf", "focus": "hERG assay, in vivo QT studies"},
    "S9":      {"title": "Nonclinical Evaluation — Anticancer Pharmaceuticals", "url": "https://database.ich.org/sites/default/files/S9_Guideline.pdf", "focus": "Reduced nonclinical programme for anticancer drugs"},
    "S11":     {"title": "Nonclinical Paediatric Safety", "url": "https://database.ich.org/sites/default/files/ICH_S11_Step4_Guideline_2020_1119.pdf", "focus": "Juvenile animal studies for paediatric development"},
    "S12":     {"title": "Nonclinical Biodistribution of Gene Therapy Products", "url": "https://database.ich.org/sites/default/files/ICH_S12_Step4_Guideline_2023_0530.pdf", "focus": "Biodistribution study design for gene therapies"},
    # ── Quality (Q-series) ───────────────────────────────────────
    "Q1A(R2)": {"title": "Stability Testing — New Substances", "url": "https://database.ich.org/sites/default/files/Q1A%28R2%29%20Guideline.pdf", "focus": "Stability study design, storage conditions, shelf life"},
    "Q1E":     {"title": "Stability Data Evaluation", "url": "https://database.ich.org/sites/default/files/Q1E_Guideline.pdf", "focus": "Statistical analysis of stability data, extrapolation"},
    "Q8(R2)":  {"title": "Pharmaceutical Development", "url": "https://database.ich.org/sites/default/files/Q8_R2_Guideline.pdf", "focus": "Quality by Design, design space, control strategy"},
    "Q9(R1)":  {"title": "Quality Risk Management", "url": "https://database.ich.org/sites/default/files/ICH_Q9%28R1%29_Guideline_Step4_2023_0126.pdf", "focus": "Risk assessment and risk control for pharmaceutical quality"},
    # ── Multidisciplinary (M-series) ─────────────────────────────
    "M4":      {"title": "CTD — Common Technical Document", "url": "https://database.ich.org/sites/default/files/M4_Guideline.pdf", "focus": "Regulatory submission format: Module 1-5 structure"},
    "M11":     {"title": "CeSHarP — Harmonised Protocol Template", "url": "https://database.ich.org/sites/default/files/ICH_M11_Step4_Guideline_2024_1121.pdf", "focus": "Standardised clinical trial protocol sections and structure"},
    "M14":     {"title": "Use of Real-World Data", "url": "https://database.ich.org/sites/default/files/ICH_M14_Step2_DraftGuideline_2025_0613.pdf", "focus": "RWD/RWE fitness-for-purpose, external controls, safety surveillance"},
}

# ════════════════════════════════════════════════════════════════
# FDA GUIDANCE REFERENCE DATABASE (for prompt grounding)
# ════════════════════════════════════════════════════════════════
FDA_GUIDANCE = {
    "Adaptive Designs": {"title": "Adaptive Designs for Clinical Trials of Drugs and Biologics", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/adaptive-designs-clinical-trials-drugs-and-biologics-guidance-industry", "year": 2019, "focus": "Bayesian, group sequential, sample size re-estimation"},
    "Non-Inferiority": {"title": "Non-Inferiority Clinical Trials to Establish Effectiveness", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/non-inferiority-clinical-trials-establish-effectiveness", "year": 2016, "focus": "NI margin selection, assay sensitivity, constancy assumption"},
    "Master Protocols": {"title": "Master Protocols: Efficient Clinical Trial Design", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/master-protocols-efficient-clinical-trial-design-strategies-expedite-development-oncology-drugs-and", "year": 2022, "focus": "Basket, umbrella, platform trials"},
    "Oncology Endpoints": {"title": "Clinical Trial Endpoints for Cancer Drug Approval", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-trial-endpoints-approval-cancer-drugs-and-biologics", "year": 2018, "focus": "OS, PFS, ORR, DFS, DOR requirements"},
    "PRO Guidance": {"title": "Patient-Reported Outcome Measures", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/patient-reported-outcome-measures-use-medical-product-development-support-labeling-claims", "year": 2009, "focus": "PRO instrument development, validation, labeling claims"},
    "Multiple Endpoints": {"title": "Multiple Endpoints in Clinical Trials", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/multiple-endpoints-clinical-trials-guidance-industry", "year": 2022, "focus": "Multiplicity control, hierarchical testing, gatekeeping"},
    "DCT": {"title": "Decentralized Clinical Trials", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/decentralized-clinical-trials-drugs-biological-products-and-devices", "year": 2024, "focus": "Remote visits, eConsent, direct-to-patient drug delivery"},
    "Enrichment": {"title": "Enrichment Strategies for Clinical Trials", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/enrichment-strategies-clinical-trials-support-approval-human-drugs-and-biological-products", "year": 2019, "focus": "Biomarker-driven, run-in, prognostic enrichment designs"},
    "Rare Diseases": {"title": "Rare Diseases: Common Issues in Drug Development", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/rare-diseases-common-issues-drug-development-guidance-industry", "year": 2019, "focus": "Small sample designs, natural history, flexible endpoints"},
    "RWE Framework": {"title": "Real-World Evidence Program Framework", "url": "https://www.fda.gov/science-research/science-and-research-special-topics/real-world-evidence", "year": 2018, "focus": "RWD quality, study designs for regulatory decision-making"},
    "Diversity Plans": {"title": "Diversity Plans to Improve Enrollment", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/diversity-plans-improve-enrollment-participants-underrepresented-populations-clinical-studies", "year": 2024, "focus": "Demographic targets, enrollment barriers, diversity action plans"},
    "External Controls": {"title": "Externally Controlled Trials Design and Conduct", "url": "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-design-and-conduct-externally-controlled-trials-drug-and-biological-products", "year": 2023, "focus": "External comparators, propensity scoring, confounding"},
}

# ════════════════════════════════════════════════════════════════
# HTA BODY REFERENCE DATABASE (for payer scoring grounding)
# ════════════════════════════════════════════════════════════════
HTA_BODY_REFS = {
    "NICE": {"title": "NICE Technology Appraisal Manual (PMG36)", "url": "https://www.nice.org.uk/process/pmg36", "country": "England", "threshold": "£20,000-£30,000/QALY", "key_instrument": "EQ-5D-5L"},
    "IQWiG": {"title": "IQWiG General Methods (v7.0)", "url": "https://www.iqwig.de/en/about-us/methods/methods-paper/", "country": "Germany", "key_requirement": "Patient-relevant endpoints only; G-BA determines comparator"},
    "CADTH": {"title": "CADTH Guidelines for Economic Evaluation (4th ed.)", "url": "https://www.cda-amc.ca/guidelines-economic-evaluation-health-technologies-canada", "country": "Canada", "key_instrument": "EQ-5D or HUI3"},
    "PBAC": {"title": "PBAC Guidelines for Preparing Submissions", "url": "https://www.pbs.gov.au/info/industry/listing/elements/pbac-guidelines", "country": "Australia", "discount_rate": "5%"},
    "AMNOG": {"title": "AMNOG Benefit Assessment (G-BA)", "url": "https://www.g-ba.de/english/", "country": "Germany", "key_requirement": "Dossier due 3 months post-launch; G-BA determines ACT"},
}

ICH_GUIDELINES_PROMPT_BLOCK = "\n".join(
    f"- {code}: {info['title']} — {info['focus']}"
    for code, info in ICH_GUIDELINES.items()
)

FDA_GUIDANCE_PROMPT_BLOCK = "\n".join(
    f"- FDA {code} ({info['year']}): {info['title']} — {info['focus']}"
    for code, info in FDA_GUIDANCE.items()
)

HTA_BODY_PROMPT_BLOCK = "\n".join(
    f"- {code} ({info['country']}): {info['title']}"
    for code, info in HTA_BODY_REFS.items()
)

# Combined reference block for comprehensive analysis grounding
ALL_REFERENCES_PROMPT_BLOCK = f"""ICH GUIDELINES (cite specific sections when relevant):
{ICH_GUIDELINES_PROMPT_BLOCK}

FDA GUIDANCE DOCUMENTS (cite when US-specific):
{FDA_GUIDANCE_PROMPT_BLOCK}

HTA BODY REFERENCES (cite for payer/reimbursement gaps):
{HTA_BODY_PROMPT_BLOCK}"""


# ════════════════════════════════════════════════════════════════
# REQ-1 + REQ-2 + REQ-5 + REQ-7: ENHANCED ANALYSIS PROMPT
# ════════════════════════════════════════════════════════════════
def build_enhanced_analysis_prompt(preferences: dict | None = None) -> str:
    """
    Build the master analysis prompt that includes:
    - ICH guideline cross-references (REQ-1)
    - Multi-jurisdiction scoring (REQ-2)
    - Payer evidence gap detection (REQ-5)
    - Smart clause suggestions (REQ-7)
    """
    pref_block = _build_preference_block(preferences)

    return f"""You are NIX AI, the world's most advanced clinical trial regulatory intelligence system.

Analyze this clinical trial protocol document and return a comprehensive JSON response.

AVAILABLE REGULATORY REFERENCES — You MUST cite specific guidelines with section numbers in your findings:
{ALL_REFERENCES_PROMPT_BLOCK}

CRITICAL ANALYSIS INSTRUCTIONS:
- Every finding MUST include guideline_refs with code, section number, title, and URL
- Cross-reference findings against ICH guidelines, FDA guidance, AND HTA body requirements
- For payer gaps, cite the specific HTA body manual section that requires the missing evidence
- Distinguish between "must-have" (regulatory blockers) vs "should-have" (quality improvements)
- Assess Quality of Life instruments: is EQ-5D-5L included? Disease-specific PRO?
- Check comparator selection against EACH jurisdiction's standard of care
- Verify statistical methodology against ICH E9(R1) estimands framework
- Check protocol structure compliance against ICH M11 CeSHarP template

Return a JSON object with these EXACT keys:

1. "regulatorScore" (0-100): Overall FDA/EMA regulatory compliance score
2. "payerScore" (0-100): Overall payer/reimbursement readiness score
3. "summary": 2-3 sentence executive summary

4. "findings": Array of finding objects, each with:
   - "id": unique string (e.g. "F001")
   - "type": "conflict" | "recommendation" | "risk" | "payer_evidence_gap"
   - "severity": "low" | "medium" | "high" | "critical"
   - "title": concise title
   - "description": detailed description
   - "section": protocol section reference
   - "suggestion": recommended fix
   - "confidence": confidence score 0-100
   - "guideline_refs": array of {{ "code": "ICH E6(R3)", "section": "5.2.1", "title": "...", "relevance": "why this applies" }}
   - "jurisdictions_affected": array of jurisdiction codes affected ["FDA", "EMA", "PMDA", "NMPA", "Health_Canada", "MHRA"]
   - "suggested_clause": protocol-ready text the user can copy-paste to fix this issue

5. "jurisdiction_scores": Array of per-jurisdiction assessments:
   - "jurisdiction": "FDA" | "EMA" | "PMDA" | "NMPA" | "Health_Canada" | "MHRA"
   - "label": "U.S. FDA" | "EU EMA" | "Japan PMDA" | "China NMPA" | "Health Canada" | "UK MHRA"
   - "flag": emoji flag
   - "compliance_score": 0-100
   - "risk_level": "low" | "medium" | "high" | "critical"
   - "blockers": array of hard blockers for this jurisdiction
   - "adaptations": array of recommended local adaptations
   - "key_guidelines": applicable ICH guideline codes

6. "global_readiness_score": 0-100 average across all jurisdictions

7. "payer_gaps": Array of HTA/payer evidence gaps:
   - "id": unique string
   - "hta_body": "NICE" | "IQWIG" | "CADTH" | "PBAC" | "AMNOG"
   - "requirement": what the HTA body expects
   - "gap_description": what's missing
   - "severity": "low" | "medium" | "high" | "critical"
   - "recommendation": how to address it
   - "impact_on_reimbursement": expected impact description

8. "hta_body_scores": {{ "NICE": 0-100, "IQWIG": 0-100, "CADTH": 0-100, "PBAC": 0-100, "AMNOG": 0-100 }}

9. "tables_detected": number of data tables found
10. "extraction_method": "native_document_block"

ANALYSIS PRIORITIES:
- Map EVERY finding to specific ICH guideline sections with correct codes AND URLs
- Also cite FDA guidance and EMA guidelines where jurisdiction-specific
- Score EACH of 6 jurisdictions independently (FDA, EMA, PMDA, NMPA, Health Canada, MHRA)
- Identify specific evidence gaps for EACH HTA body (NICE, IQWIG, CADTH, PBAC, AMNOG)
- For each HTA gap, cite the specific manual section and requirement
- Generate copy-paste-ready protocol clauses for each finding
- Flag QoL endpoints: check for EQ-5D-5L (required by NICE), disease-specific PROs
- Assess comparator arm: is it the standard of care for each target market?
- Verify: sample size justification, power calculation, alpha allocation strategy
- Check: estimand framework per ICH E9(R1), intercurrent events handling
- Check: safety monitoring plan, DSMB charter, stopping rules
- Check: informed consent, data integrity, risk-based monitoring per ICH E6(R3)
- For oncology: verify RECIST/iRECIST criteria, OS follow-up plan, biomarker strategy
- For CV: verify MACE definition, event adjudication committee, CV safety per FDA requirement
{pref_block}
Respond with ONLY valid JSON. No markdown, no explanation, no code fences."""


def _build_preference_block(preferences: dict | None) -> str:
    """Build preference instructions from user settings."""
    if not preferences:
        return ""
    parts = []
    sensitivity = preferences.get("risk_sensitivity", "balanced")
    focus = preferences.get("analysis_focus", "both")
    include_recs = preferences.get("include_recommendations", True)
    reg_threshold = preferences.get("regulatory_threshold", 50)
    pay_threshold = preferences.get("payer_threshold", 50)

    if sensitivity == "conservative":
        parts.append("Use CONSERVATIVE risk sensitivity: flag more potential issues.")
    elif sensitivity == "aggressive":
        parts.append("Use AGGRESSIVE risk sensitivity: only flag high-confidence issues.")
    if focus == "regulatory":
        parts.append("FOCUS PRIMARILY on regulatory compliance. Payer analysis is secondary.")
    elif focus == "payer":
        parts.append("FOCUS PRIMARILY on payer/reimbursement. Regulatory is secondary.")
    if not include_recs:
        parts.append("Do NOT include recommendation-type findings. Focus only on conflicts and risks.")
    parts.append(f"Risk thresholds: regulatory scores below {reg_threshold}% = HIGH RISK; payer below {pay_threshold}% = LOW VIABILITY.")

    return "\n\nUser preferences:\n" + "\n".join(f"- {p}" for p in parts)


# ════════════════════════════════════════════════════════════════
# REQ-3: AMENDMENT IMPACT SIMULATION
# ════════════════════════════════════════════════════════════════
def simulate_amendment(
    document_text: str,
    original_analysis: dict,
    amendment_description: str,
    preferences: dict | None = None,
) -> dict:
    """
    Simulate the impact of a proposed amendment on the protocol.
    Compares original analysis with projected post-amendment state.
    """
    original_reg = original_analysis.get("regulator_score", 0)
    original_pay = original_analysis.get("payer_score", 0)
    original_findings = original_analysis.get("findings", [])

    # Truncate doc text
    doc_excerpt = document_text[:10000] if document_text else ""
    findings_summary = json.dumps(original_findings[:10], default=str)[:3000]

    prompt = f"""You are NIX AI, the world's most advanced clinical trial regulatory intelligence system.

TASK: Simulate the impact of a proposed protocol amendment.

CURRENT PROTOCOL (excerpt):
---
{doc_excerpt}
---

CURRENT ANALYSIS:
- Regulator Score: {original_reg}/100
- Payer Score: {original_pay}/100
- Current Findings: {findings_summary}

PROPOSED AMENDMENT:
"{amendment_description}"

Analyze how this amendment would change the protocol's regulatory and payer profile.

Return a JSON object with:
1. "regulator_score_after": projected new regulator score (0-100)
2. "payer_score_after": projected new payer score (0-100)
3. "new_findings": array of NEW findings introduced by this amendment (same schema as analysis findings, including guideline_refs, jurisdictions_affected, suggested_clause)
4. "resolved_finding_ids": array of finding IDs from original analysis that would be resolved by this amendment
5. "net_risk_change": "improved" | "degraded" | "neutral"
6. "summary": 2-3 sentence summary of the amendment's impact
7. "jurisdiction_impacts": array of {{ "jurisdiction": "FDA", "impact": "positive|negative|neutral", "detail": "..." }}

AVAILABLE REGULATORY REFERENCES:
{ALL_REFERENCES_PROMPT_BLOCK}

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=3000, temperature=0.3)
        result = _parse_json_response(raw)

        reg_after = float(result.get("regulator_score_after", original_reg))
        pay_after = float(result.get("payer_score_after", original_pay))

        return {
            "regulator_delta": {
                "before": original_reg,
                "after": reg_after,
                "delta": round(reg_after - original_reg, 1),
                "direction": "improved" if reg_after > original_reg else "degraded" if reg_after < original_reg else "neutral",
            },
            "payer_delta": {
                "before": original_pay,
                "after": pay_after,
                "delta": round(pay_after - original_pay, 1),
                "direction": "improved" if pay_after > original_pay else "degraded" if pay_after < original_pay else "neutral",
            },
            "new_findings": result.get("new_findings", []),
            "resolved_findings": result.get("resolved_finding_ids", []),
            "net_risk_change": result.get("net_risk_change", "neutral"),
            "summary": result.get("summary", ""),
            "jurisdiction_impacts": result.get("jurisdiction_impacts", []),
        }
    except Exception as exc:
        logger.error("Amendment simulation failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# REQ-6: PROTOCOL COMPARISON
# ════════════════════════════════════════════════════════════════
def compare_protocols(documents: list[dict]) -> dict:
    """
    Compare multiple protocols across key dimensions.
    Each doc dict has: { "id", "name", "text" (excerpt), "analysis" (if exists) }
    """
    doc_summaries = []
    for doc in documents:
        text = (doc.get("text") or "")[:5000]
        analysis = doc.get("analysis") or {}
        doc_summaries.append(
            f"Document: {doc['name']} (ID: {doc['id']})\n"
            f"Regulator Score: {analysis.get('regulator_score', 'N/A')}\n"
            f"Payer Score: {analysis.get('payer_score', 'N/A')}\n"
            f"Text excerpt: {text[:3000]}\n---"
        )

    all_docs = "\n\n".join(doc_summaries)

    prompt = f"""You are NIX AI, the world's most advanced clinical trial regulatory intelligence system.
Compare these clinical trial protocols against each other AND against regulatory/HTA best practices.

PROTOCOLS:
{all_docs}

AVAILABLE REGULATORY REFERENCES — cite specific guidelines in your comparison rationale:
{ALL_REFERENCES_PROMPT_BLOCK}

Compare these protocols across key dimensions and return JSON:

1. "dimensions": array of comparison dimensions, each with:
   - "dimension": name (e.g. "Primary Endpoint", "Sample Size", "Statistical Design", "Safety Monitoring", "Adaptive Features", "Inclusion Criteria", "Comparator", "Duration", "HTA Readiness", "Estimand Framework")
   - "values": {{ "doc_id": "value for each protocol" }}
   - "winner": doc_id of better protocol for this dimension (or null if tied)
   - "rationale": why one is better — cite ICH/FDA/HTA guidelines
   - "guideline_refs": array of {{ "code": "ICH E9(R1)", "section": "A.2", "relevance": "why" }}

2. "score_comparison": {{ "doc_id": {{ "regulator": score, "payer": score }} }}

3. "overall_winner": doc_id of the overall better protocol (or null)

4. "summary": 3-4 sentence comparative summary referencing specific guideline compliance differences

5. "payer_comparison": {{ "doc_id": {{ "NICE": score, "IQWIG": score, "CADTH": score }} }} — HTA readiness per protocol

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=3000, temperature=0.3)
        return _parse_json_response(raw)
    except Exception as exc:
        logger.error("Protocol comparison failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# REQ-10: BENCHMARKING ANALYSIS
# ════════════════════════════════════════════════════════════════
def generate_benchmark_analysis(
    document_text: str,
    similar_trials: list[dict],
    analysis: dict | None = None,
) -> dict:
    """
    Benchmark a protocol against similar trials data.
    """
    doc_excerpt = document_text[:6000] if document_text else ""
    trials_summary = json.dumps(similar_trials[:20], default=str)[:4000]

    prompt = f"""You are NIX AI, the world's most advanced clinical trial regulatory intelligence system.
Benchmark this clinical trial protocol against industry norms AND regulatory best practices.

PROTOCOL (excerpt):
{doc_excerpt}

SIMILAR TRIALS DATA:
{trials_summary}

AVAILABLE REGULATORY REFERENCES — cite when protocol deviates from best practice:
{ALL_REFERENCES_PROMPT_BLOCK}

Generate comprehensive benchmarking data. Return JSON:

1. "benchmarks": array of benchmark metrics:
   - "metric": name (e.g. "Sample Size", "Study Duration", "Number of Arms", "Primary Endpoint Type", "Use of Adaptive Design", "QoL Instruments", "Number of Sites", "Estimand Framework", "HTA Evidence Readiness", "Safety Monitoring Rigor")
   - "protocol_value": value from user's protocol
   - "benchmark_median": median from similar trials
   - "benchmark_range": range (e.g. "50-500")
   - "percentile": where protocol falls (0-100, null if not calculable)
   - "assessment": "above_average" | "below_average" | "typical"
   - "guideline_ref": relevant ICH/FDA guideline code if applicable (e.g. "ICH E9(R1)" for estimand, "ICH E1" for exposure)

2. "regulatory_benchmarks": array of regulatory compliance comparisons:
   - "requirement": what the guideline expects
   - "protocol_status": "compliant" | "partial" | "missing"
   - "guideline_code": e.g. "ICH E6(R3)"
   - "recommendation": improvement suggestion

3. "summary": 2-3 sentence summary referencing specific guideline codes

Respond with ONLY valid JSON."""

    try:
        raw = bedrock_service.invoke_model(prompt, max_tokens=2000, temperature=0.3)
        return _parse_json_response(raw)
    except Exception as exc:
        logger.error("Benchmark analysis failed: %s", exc)
        raise


# ════════════════════════════════════════════════════════════════
# Helper: Parse JSON from Bedrock response
# ════════════════════════════════════════════════════════════════
def _parse_json_response(raw: str) -> dict:
    """Extract and parse JSON from Bedrock model output."""
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if json_match:
        return json.loads(json_match.group())
    return {}


def enrich_guideline_urls(findings: list[dict]) -> list[dict]:
    """
    Add official URLs to guideline references in findings.
    Covers ICH guidelines, FDA guidance, and HTA body references.
    """
    for finding in findings:
        refs = finding.get("guideline_refs", [])
        for ref in refs:
            code = ref.get("code", "")
            # Try ICH guidelines first
            if code in ICH_GUIDELINES:
                ref["url"] = ICH_GUIDELINES[code]["url"]
                if not ref.get("title"):
                    ref["title"] = ICH_GUIDELINES[code]["title"]
                ref["source_type"] = "ICH"
                continue
            # Try ICH with "ICH " prefix stripped
            stripped = code.replace("ICH ", "").strip()
            if stripped in ICH_GUIDELINES:
                ref["url"] = ICH_GUIDELINES[stripped]["url"]
                if not ref.get("title"):
                    ref["title"] = ICH_GUIDELINES[stripped]["title"]
                ref["source_type"] = "ICH"
                continue
            # Try FDA guidance
            for fda_key, fda_info in FDA_GUIDANCE.items():
                if fda_key.lower() in code.lower() or code.lower() in fda_info["title"].lower():
                    ref["url"] = fda_info["url"]
                    if not ref.get("title"):
                        ref["title"] = fda_info["title"]
                    ref["source_type"] = "FDA"
                    break
            # Try HTA body references
            for hta_key, hta_info in HTA_BODY_REFS.items():
                if hta_key.lower() in code.lower():
                    ref["url"] = hta_info["url"]
                    if not ref.get("title"):
                        ref["title"] = hta_info["title"]
                    ref["source_type"] = "HTA"
                    break
    return findings
