---
category: reference
source_file: payer_evidence_frameworks.json
document_type: knowledge_base_reference
---

# Payer Evidence Frameworks — Market Access Requirements

Detailed evidence requirements from major payer bodies worldwide.
Designed to optimise protocols for regulatory AND market access.


## Payer Landscape Overview
- Key Principle: Regulatory approval ≠ payer acceptance. Trials must be designed to generate evidence that satisfies BOTH regulatory and HTA requirements simultaneously.
**Common Payer Gaps In Protocols:**
  - No active comparator (or comparator not standard of care in target market)
  - Missing quality of life / PRO data collection
  - Insufficient follow-up for long-term outcomes
  - No health economic data collection (resource use, costs)
  - Population not representative of real-world patients
  - Subgroup analyses not pre-specified for HTA-relevant populations
  - Missing indirect comparison feasibility (no common comparator arm)


## Nice England
- Body: National Institute for Health and Care Excellence
- Country: England and Wales
- Manual Url: https://www.nice.org.uk/process/pmg36
**Evidence Requirements:**
  **Comparator:**
    - Requirement: Must compare against NHS standard of care
    - Detail: If direct comparison unavailable, network meta-analysis (NMA) via common comparator required
    - Common Deficiency: International trials using US standard of care that differs from NHS practice
  **Outcomes:**
    - Preferred Primary: Quality-adjusted life years (QALYs) using EQ-5D-5L
    **Required Instruments:**
      - Generic Qol: EQ-5D-5L (preferred) or EQ-5D-3L (acceptable)
      - Mapping: If disease-specific instrument used, validated mapping to EQ-5D required
      - Note: NICE DSU Technical Support Documents provide mapping guidance
    **Additional:**
      - Overall survival
      - Progression-free survival
      - Disease-specific outcomes
  **Cost Effectiveness:**
    - Threshold: £20,000-£30,000 per QALY (standard)
    **Severity Modifier:**
      - Description: Severity modifier applies based on absolute and proportional shortfall
      **Multipliers:**
        - No Modifier: 1.0x — shortfall < threshold
        - Modifier 1.2: 1.2x — moderate severity
        - Modifier 1.7: 1.7x — high severity
      **Effective Thresholds:**
        - Standard: £20,000 - £30,000
        - Moderate Severity: £24,000 - £36,000
        - High Severity: £34,000 - £51,000
    - Hst Threshold: Up to £100,000-£300,000/QALY for Highly Specialised Technologies (ultra-rare diseases)
  **Statistical Requirements:**
    - ITT population as primary analysis
    - Pre-specified subgroup analyses
    - Kaplan-Meier and Cox PH model for time-to-event
    - Extrapolation of survival data beyond trial: multiple parametric models required
    - NICE DSU TSD 14 for survival extrapolation methods
  **Submission Elements:**
    - Company evidence submission with systematic literature review
    - De novo economic model (cost-effectiveness analysis)
    - Budget impact analysis
    - Patient and clinical expert testimony


## Iqwig Gba Germany
- Body: Institute for Quality and Efficiency in Health Care / Federal Joint Committee
- Country: Germany
- Methods Url: https://www.iqwig.de/en/about-us/methods/methods-paper/
**Evidence Requirements:**
  **Amnog Process:**
    - Description: AMNOG (Arzneimittelmarktordnungsgesetz) benefit assessment
    - Timeline: Dossier due within 3 months of market launch
    **Comparator:**
      - Requirement: G-BA determines the Appropriate Comparator Therapy (ACT)
      - Critical Note: ACT may differ from ICH E10 active comparator — must confirm with G-BA early
      - Consequence: If trial comparator ≠ ACT, benefit cannot be proven → lowest price tier
  **Benefit Categories:**
    **Major:**
      - Description: Sustained and large improvement in therapy-relevant benefit, especially survival or cure
      - Typical Evidence: RCT with OS benefit, large effect size
    **Considerable:**
      - Description: Considerable improvement in therapy-relevant benefit
      - Typical Evidence: RCT with clinically meaningful PFS or PRO benefit
    **Minor:**
      - Description: Moderate and not merely minor improvement
      - Typical Evidence: RCT with statistically significant but smaller benefit
    **Non Quantifiable:**
      - Description: Added benefit not quantifiable
      - Typical Evidence: Indirect comparison, mixed evidence
    **No Added Benefit:**
      - Description: No added benefit over comparator proven
      - Consequence: Reference price applies
    **Less Benefit:**
      - Description: Less benefit than comparator
      - Consequence: Rare but possible → major pricing impact
  **Endpoint Requirements:**
    - Patient Relevant Endpoints Only: True
    **Accepted Endpoints:**
      - Overall survival
      - Morbidity (symptoms, functional status)
      - Health-related quality of life
      - Side effects
    **Not Accepted As Primary:**
      - PFS (unless validated surrogate)
      - Biomarkers
      - Imaging endpoints
    - Surrogate Endpoints: Only accepted if validated per IQWiG methodology — very high bar
  **Statistical Standards:**
    - p < 0.05 for added benefit
    - Confidence intervals required
    - Subgroup analyses by age, sex, disease severity, prior treatment
    - Effect size classification per IQWiG methods


## Cadth Canada
- Body: Canada's Drug Agency (formerly CADTH)
- Country: Canada
- Guidelines Url: https://www.cda-amc.ca/guidelines-economic-evaluation-health-technologies-canada
**Evidence Requirements:**
  **Review Types:**
    - Cadth Reimbursement Review: Standard new drug reviews
    - Pcodr: Pan-Canadian Oncology Drug Review (now integrated)
  **Comparator:**
    - Requirement: Canadian standard of care as determined by CADTH
    - Consideration: Provincial formulary may differ — check by province
  **Outcomes:**
    **Primary:**
      - Clinical effectiveness (OS, PFS, ORR as applicable)
      - Patient-reported outcomes
      - Safety
    **Economic:**
      - Cost-utility analysis (cost per QALY)
      - Budget impact analysis over 3 years
    - Qol Instruments: EQ-5D preferred, HUI3 also accepted in Canadian context
  **Deliberative Framework:**
    - Clinical benefit and harms
    - Patient values and preferences (via patient group input)
    - Economic evaluation
    - Feasibility of implementation in Canadian healthcare system
  **Icer Threshold:**
    - Description: No explicit threshold but ~$50,000-$100,000 CAD/QALY informally used
    - Context: CADTH considers willingness-to-pay in context of severity and unmet need


## Pbac Australia
- Body: Pharmaceutical Benefits Advisory Committee
- Country: Australia
- Guidelines Url: https://www.pbs.gov.au/info/industry/listing/elements/pbac-guidelines
**Evidence Requirements:**
  **Submission Types:**
    - Major: New chemical entity or new indication
    - Minor: Change to existing listing
  **Comparator:**
    - Requirement: Main comparator = therapy most likely to be replaced in Australian clinical practice
    - Pbs Listing: Must be PBS-listed comparator
  **Clinical Evaluation:**
    - Systematic review of direct RCT evidence
    - GRADE framework for evidence quality assessment
    - Network meta-analysis if no head-to-head data
  **Economic Evaluation:**
    **Types:**
      - Cost-effectiveness analysis (CEA)
      - Cost-utility analysis (CUA) using QALY
    - Qol Instruments: EQ-5D or other validated instrument with Australian utility weights
    - Discount Rate: 5% for both costs and outcomes
    - Perspective: Australian healthcare system perspective
  **Additional Requirements:**
    - Risk-sharing arrangements considered for uncertain evidence
    - Real-world evidence may be required post-listing
    - Managed entry schemes for high-cost therapies


## Pmda Japan
- Body: Pharmaceuticals and Medical Devices Agency
- Country: Japan
**Evidence Requirements:**
  **Bridging Strategy:**
    - Requirement: ICH E5(R1) bridging study may be required
    - When Needed: When intrinsic/extrinsic ethnic factors suggest different response in Japanese population
    - Typical Design: Japanese bridging study with PK/PD + efficacy/safety in Japanese patients
  **Cost Effectiveness:**
    - Description: HTA introduced in 2019 (Chuikyo)
    - Threshold: ¥5-10 million/QALY (approximately)
    - Scope: Applies to drugs exceeding peak sales thresholds


## Has France
- Body: Haute Autorité de Santé
- Country: France
- Guidelines Url: https://www.has-sante.fr
**Evidence Requirements:**
  **Dual Assessment:**
    **Smr:**
      - Description: Service Médical Rendu — determines reimbursement eligibility and rate
      **Levels:**
        - Major (100% reimbursement)
        - Important (65%)
        - Moderate (30%)
        - Low (15%)
        - Insufficient (no reimbursement)
    **Asmr:**
      - Description: Amélioration du SMR — determines price premium vs existing therapies
      **Levels:**
        - I - Major improvement
        - II - Important
        - III - Moderate
        - IV - Minor
        - V - No improvement
      - Pricing Impact: ASMR I-III: EU reference pricing with premium; ASMR IV: modest premium; ASMR V: price ≤ comparator
  **Comparator:**
    - Requirement: Must reflect French clinical practice and guidelines
    - Critical Note: French treatment patterns may differ significantly from US/UK — early engagement with HAS essential
  **Outcomes:**
    **Primary:**
      - Clinical benefit (mortality, morbidity, QoL)
      - Place in therapeutic strategy
    - Economic: CEESP evaluation required for ASMR I-III products and those with significant budget impact
    - Discount Rate: 2.5% (lower than NICE 3.5%)
    - Perspective: Collective (broader than just healthcare)


## Aifa Italy
- Body: Agenzia Italiana del Farmaco
- Country: Italy
- Guidelines Url: https://www.aifa.gov.it
**Evidence Requirements:**
  **Innovation Designation:**
    **Full Innovation:**
      **Criteria:**
        - Unmet therapeutic need
        - Added therapeutic value
        - Quality of evidence
      - Benefit: Automatic regional reimbursement + dedicated innovation fund (€1B/year)
  **Managed Entry Agreements:**
    - Description: Italy is a pioneer in outcome-based pricing — most new drugs have some form of MEA
    **Types:**
      - Payment by Results
      - Risk Sharing
      - Cost Sharing
      - Capping
      - Success Fee
    **Protocol Impact:**
      - Must define clear responder criteria at protocol level
      - Early response biomarkers needed for cost-sharing triggers
      - AIFA Monitoring Registry integration required
  **Comparator:**
    - Requirement: Italian standard of care — may differ from other EU countries
    - Note: Generic penetration and biosimilar uptake in Italy affects comparator selection


## Eu Jca
- Body: EU Joint Clinical Assessment
- Jurisdiction: European Union (27 member states)
- Regulation: EU HTA Regulation 2021/2282
- Effective Date: January 2025 — oncology + ATMPs first; all new drugs from 2030
**Evidence Requirements:**
  **Scope:**
    - Description: Centralized EU-wide assessment of relative clinical effectiveness — replaces individual national clinical assessments
    **What It Covers:**
      - Relative clinical effectiveness
      - Relative safety
    **What Remains National:**
      - Economic evaluation
      - Budget impact
      - Pricing decisions
      - Reimbursement decisions
  **Comparator:**
    - Requirement: Must address comparators relevant across ALL EU member states
    - Challenge: Different EU countries may have different SOC — multi-comparator strategy or NMA essential
    - Recommendation: Joint scientific consultation with EU coordination group during protocol development
  **Endpoints:**
    - Requirement: Patient-relevant outcomes (IQWiG tradition applied EU-wide)
    **Mandatory:**
      - Survival
      - Morbidity
      - HRQoL
      - Safety
    - Surrogate Risk: EU JCA will apply stricter surrogate endpoint scrutiny than individual countries previously did
  **Protocol Implications:**
    - Single pan-EU evidence package replaces 27 national dossiers for clinical component
    - Comparator selection becomes more complex — must satisfy multiple national perspectives
    - QoL data collection mandatory from trial start
    - Subgroup analyses for EU-relevant populations pre-specified
    - Standardized PICO framework mandatory for submission


## Icer Usa
- Body: Institute for Clinical and Economic Review
- Country: United States
- Guidelines Url: https://icer.org/our-approach/methods-process/
- Role: Independent HTA body — not government-mandated but increasingly influential on US payer decisions
**Evidence Requirements:**
  **Value Framework:**
    - Description: ICER Value Assessment Framework 2020-2023
    **Components:**
      - Comparative clinical effectiveness review
      - Cost-effectiveness analysis (cost per QALY, cost per evLYG)
      - Budget impact analysis (5-year US budget impact)
      - Voting by independent evidence review committee
  **Thresholds:**
    - Cost Per Qaly: $50,000-$150,000/QALY (range used for value-based price benchmarks)
    - Cost Per Evlyg: Equal value of life years gained — adjustment for treatments that extend life with low QoL
    - Budget Impact Threshold: $819M/year (2023-2024 threshold, updated annually)
  **Influence:**
    - Payer Impact: Major US commercial payers (Aetna, Cigna, Express Scripts) reference ICER reports in formulary decisions
    - Pbm Impact: Pharmacy Benefit Managers use ICER value-based benchmarks for price negotiations
    - Limitations: ICER is advisory only; CMS (Medicare) does not formally use ICER thresholds for Part D
  **Protocol Implications:**
    - Include active comparator relevant to US clinical practice
    - Collect US-specific resource use and cost data
    - EQ-5D-5L for QALY estimation
    - Plan for ICER evidence review timeline (often during FDA review period)
    - Consider ICER's evLYG alongside QALY to address concerns about disability discrimination


## Outcomes Based Contracting
- Description: Framework for outcome-based and value-based pricing agreements globally
- Growing Importance: Increasing number of payers require outcome-based pricing evidence, especially for gene therapies, CAR-T, and high-cost drugs
**Contract Types:**
  **Outcomes Based:**
    - Payment By Results: Full/partial refund if treatment doesn't achieve pre-defined clinical outcome
    - Risk Sharing: Price reduction proportional to non-responders in real-world use
    - Success Fee: Payment contingent on achieving specified outcome
  **Financial Based:**
    - Volume Caps: Maximum spend per patient or per year
    - Dose Capping: Free drug after maximum number of doses/cycles
    - Instalment Payments: Annuity-based payment for one-time therapies (gene therapy model)
**Protocol Design Requirements:**
  - Define clear, measurable responder criteria early in protocol
  - Include biomarkers or clinical assessments that can serve as early response triggers
  - Plan for real-world outcome tracking (registry, EHR linkage)
  - Align trial endpoints with payer-relevant outcome measures
  - Consider durability of response endpoints for long-term agreements
  - Gene therapies: include long-term follow-up plan for outcome verification (5-15 years)
**Examples:**
  - Gene Therapy: Novartis Zolgensma — outcomes-based agreement in multiple EU markets
  - Car T: Kymriah — payment by results in UK (NICE) and Italy (AIFA)
  - Oncology: Multiple outcomes-based contracts for PD-1/PD-L1 inhibitors in Italy


## Cross Cutting Payer Requirements
**Protocol Design Recommendations:**
  **Comparator Alignment:**
    - Description: Align trial comparator with the most common standard of care across target markets
    **Action Items:**
      - Conduct early parallel scientific advice with EMA + NICE/G-BA
      - Map comparator requirements across FDA, EMA, NICE, G-BA, CADTH, PBAC
      - If multiple comparators needed, consider multi-arm trial design
      - Document comparator rationale per ICH E10 AND per HTA body requirements
  **Qol Data Collection:**
    - Description: Collect generic + disease-specific QoL data from Day 1
    **Mandatory Instruments:**
      - EQ-5D-5L (required by NICE, accepted everywhere)
      - Disease-specific PRO instrument validated for therapeutic area
    **Timing:**
      - Baseline (pre-randomisation)
      - Every cycle or visit (during treatment)
      - End of treatment
      - Follow-up visits (every 3-6 months)
      - Disease progression event
      - End of study
    - Compliance Target: >80% completion rate to support economic analysis
  **Health Economics Data:**
    - Description: Resource use data collection in clinical trial
    **Items To Collect:**
      - Hospitalisations (reason, duration, costs)
      - Emergency department visits
      - Outpatient visits (specialist, GP)
      - Concomitant medications
      - Laboratory tests and imaging
      - Home care / nursing visits
      - Work productivity (if relevant)
    - Instrument: Resource Use Questionnaire (RUQ) or electronic case report form fields
  **Subgroup Analyses For Hta:**
    - Description: Pre-specify HTA-relevant subgroups in protocol and SAP
    **Common Subgroups:**
      - Prior treatment history (treatment-naive vs experienced)
      - Disease severity (mild/moderate/severe)
      - Biomarker status (positive vs negative)
      - Age groups (< 65, 65-75, > 75)
      - Geographic region (for MRCT)
      - Comorbidities (cardiovascular, renal, hepatic)
  **Long Term Data:**
    - Description: Plan for long-term data collection beyond primary analysis
    **Strategies:**
      - Open-label extension study for safety and durability
      - Registry-based follow-up for OS and long-term outcomes
      - Database linkage (claims data, electronic health records)
      - Post-marketing commitment studies


## Payer Score Calculation
- Description: NIX AI Payer Readiness Score methodology
**Components:**
  **Comparator Alignment:**
    - Weight: 0.25
    **Criteria:**
      - Comparator is current SoC
      - Active (not placebo-only)
      - Aligned across target markets
  **Qol Data Collection:**
    - Weight: 0.2
    **Criteria:**
      - EQ-5D-5L included
      - Disease-specific PRO included
      - Adequate collection timepoints
      - >80% completion plan
  **Health Economic Data:**
    - Weight: 0.15
    **Criteria:**
      - Resource use data collected
      - Cost categories pre-specified
      - Modeling inputs available
  **Endpoint Relevance:**
    - Weight: 0.15
    **Criteria:**
      - Patient-relevant endpoints (IQWiG accepted)
      - Clinically meaningful thresholds defined
      - Validated surrogate endpoints if used
  **Subgroup Pre Specification:**
    - Weight: 0.1
    **Criteria:**
      - HTA-relevant subgroups in protocol
      - Adequate power for key subgroups
      - Interaction tests planned
  **Long Term Evidence Plan:**
    - Weight: 0.1
    **Criteria:**
      - Extension study planned
      - Long-term follow-up strategy
      - Real-world evidence generation plan
  **Indirect Comparison Feasibility:**
    - Weight: 0.05
    **Criteria:**
      - Common comparator arm enables NMA
      - Endpoint definitions match published trials
      - Patient population comparable to existing evidence
**Scoring Thresholds:**
  **Payer Ready:**
    - Score Range: 80-100
    - Description: Protocol optimised for HTA submissions across major markets
  **Mostly Ready:**
    - Score Range: 60-79
    - Description: Minor gaps addressable via protocol amendment or parallel data collection
  **Significant Gaps:**
    - Score Range: 40-59
    - Description: Notable deficiencies that may delay or limit reimbursement
  **Not Payer Ready:**
    - Score Range: 0-39
    - Description: Major redesign needed for market access evidence requirements
