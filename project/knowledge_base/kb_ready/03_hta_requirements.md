---
category: guideline
source_file: hta_body_requirements.json
document_type: knowledge_base_reference
---

# Health Technology Assessment Body Requirements

Evidence requirements from NICE, IQWiG, CADTH, PBAC, and AMNOG
for market access and reimbursement submissions.


## National Institute for Health and Care Excellence (United Kingdom)
- **Manual URL**: https://www.nice.org.uk/process/pmg36

### Appraisal Types
- Technology Appraisal (TA)
- Highly Specialised Technologies (HST)

### Icer Thresholds
- Standard: £20,000-£30,000 per QALY
- End Of Life: Up to £50,000 per QALY with life-extending criteria
- Hst: Up to £100,000 per QALY for highly specialised technologies
- Severity Modifier: Up to 3.2x weighting for most severe conditions (QALY shortfall ≥18 years)

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: Systematic review of RCTs with meta-analysis
  - Comparator: NHS standard of care (active comparator preferred)
  **Endpoints Required:**
    - Overall survival or equivalent clinical outcome
    - Health-related quality of life (EQ-5D-5L preferred)
    - Disease-specific clinical endpoints
    - Patient-reported outcomes
  **Data Quality:**
    - RCTs with active comparator strongly preferred
    - Network meta-analysis acceptable when no head-to-head data
    - Real-world evidence can supplement but not replace RCT data
    - Subgroup analyses should be pre-specified
**Cost Effectiveness:**
  - Perspective: NHS and Personal Social Services (PSS)
  - Preferred Model Type: Markov or partitioned survival model
  - Discount Rate: 3.5% for costs and health outcomes
  - Time Horizon: Lifetime (must capture all relevant costs and outcomes)
  - Utility Measurement: EQ-5D-5L mapped to EQ-5D-3L value set (2022 update: EQ-5D-5L value set preferred)
  **Cost Sources:**
    - NHS Reference Costs (latest year)
    - PSSRU Unit Costs of Health and Social Care
    - BNF for drug costs
    - eMIT for generic drug costs
  **Sensitivity Analyses:**
    - Deterministic sensitivity analysis (tornado diagram)
    - Probabilistic sensitivity analysis (PSA) — minimum 10,000 iterations
    - Scenario analyses for key structural assumptions
    - Cost-effectiveness acceptability curve (CEAC)
**Budget Impact:**
  - Required: True
  - Time Horizon: 5 years from launch
  - Population Estimates: UK eligible patient numbers with uptake curve
**Submission Requirements:**
  - Executable economic model (Excel)
  - Full systematic literature review
  - Clinical study report access
  - Patient expert testimony
  - NHS clinical expert input
  - Budget impact analysis

### Common Gaps In Protocols
- No EQ-5D quality of life measurement
- Placebo comparator instead of active standard of care
- No head-to-head comparison with NHS-relevant comparator
- Insufficient follow-up duration for lifetime extrapolation
- Missing healthcare resource use data collection
- No pre-specified subgroup for UK/European population
- Surrogate endpoints without validated link to OS/QALYs
- No patient-reported outcomes mapped to utilities

### Recent Updates
- 2025: Updated severity modifier replacing end-of-life criteria
- 2024: EQ-5D-5L value set now preferred over mapped EQ-5D-3L
- 2024: Enhanced real-world evidence framework for post-approval commitments
- 2023: Managed access agreements and commercial arrangements framework updated


## Institut für Qualität und Wirtschaftlichkeit im Gesundheitswesen (Germany)
- **Manual URL**: 

### Appraisal Types
- Early Benefit Assessment (AMNOG)
- Health Technology Assessment

### Benefit Categories
- Major added benefit
- Considerable added benefit
- Minor added benefit
- Non-quantifiable added benefit
- No added benefit proven
- Lesser benefit

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: RCTs vs. appropriate comparator therapy (ACT) as defined by G-BA
  - Comparator: Appropriate Comparator Therapy (ACT) — defined by Federal Joint Committee (G-BA)
  **Endpoints Required:**
    - Mortality (overall survival)
    - Morbidity (validated disease-specific instruments)
    - Health-related quality of life (validated instruments, not restricted to EQ-5D)
    - Side effects (all-cause AEs, serious AEs, treatment discontinuation due to AEs)
  **Endpoint Categories:**
    - Patient Relevant: Mortality, morbidity, HRQoL, side effects — ONLY these count
    - Surrogate Not Accepted: Surrogate endpoints NOT accepted unless validated link to patient-relevant endpoints
    - Pfs Controversial: PFS alone is often NOT sufficient — must demonstrate link to OS or QoL
**Assessment Methodology:**
  **Certainty Of Evidence:**
    - Proof (RCT, p<0.05)
    - Indication (RCT with limitations)
    - Hint (observational or limited data)
  - Subgroup Analysis: IQWiG performs own subgroup analyses — pre-specified subgroups in protocol improve dossier quality
  - Indirect Comparisons: Accepted only if no direct comparison available, using adjusted indirect comparison methods
**Dossier Requirements:**
  - Module 1: Administrative information
  - Module 2: Summary
  - Module 3: Clinical study data (most critical)
  - Module 4: Health economic evaluation (for G-BA price negotiation)
  - Module 5: Budget impact analysis
  - Full clinical study reports required
  - Individual patient data access may be requested

### Common Gaps In Protocols
- Active comparator does not match G-BA's ACT (most critical gap)
- Reliance on surrogate endpoints without validated link to patient-relevant outcomes
- PFS as primary endpoint without OS or QoL co-primary
- Missing quality of life data collection with validated instrument
- No pre-specified subgroup analyses for German population
- Missing side effect endpoints (all-cause AE rate, discontinuation rate)
- Single-arm study design (no added benefit can be proven)
- Composite endpoints that mix patient-relevant and surrogate components

### Recent Updates
- 2025: Updated methodological guidance on indirect comparisons
- 2024: New framework for gene therapies and ATMPs
- 2024: Enhanced requirements for RWE in post-marketing studies


## Canada's Drug Agency (formerly Canadian Agency for Drugs and Technologies in Health) (Canada)
- **Manual URL**: 

### Appraisal Types
- CADTH Reimbursement Review
- pan-Canadian Oncology Drug Review (pCODR)

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: Systematic review with meta-analysis of RCTs
  - Comparator: Canadian standard of care (may differ from US/EU)
  **Endpoints Required:**
    - Overall survival or disease-specific survival
    - Health-related quality of life (EQ-5D preferred)
    - Symptom improvement / patient-reported outcomes
    - Safety profile (AEs, SAEs, discontinuation)
**Cost Effectiveness:**
  - Perspective: Publicly funded healthcare payer
  - Preferred Model Type: State-transition or partitioned survival model
  - Discount Rate: 1.5% for costs and health outcomes (updated 2017)
  - Time Horizon: Lifetime
  - Utility Measurement: EQ-5D with Canadian value set preferred
  - Drug Costs: Submitted price; pCPA negotiated price for final assessment
**Budget Impact:**
  - Required: True
  - Time Horizon: 3 years
  - Perspective: Public drug plan

### Common Gaps In Protocols
- Comparator not reflecting Canadian standard of care
- Missing EQ-5D data collection for utility estimation
- No Canadian sites in multi-regional trial (external validity concern)
- Insufficient follow-up for long-term cost-effectiveness extrapolation
- Missing patient group input and patient values data


## Pharmaceutical Benefits Advisory Committee (Australia)
- **Manual URL**: 

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: Direct randomized head-to-head comparisons
  - Comparator: PBS-listed therapy or current clinical practice in Australia
  **Endpoints Required:**
    - Clinical outcomes relevant to Australian clinical practice
    - Quality of life (preferably EQ-5D or AQoL)
    - Overall survival (oncology)
    - Safety: treatment-related AEs, SAEs
**Cost Effectiveness:**
  - Perspective: Australian healthcare system (PBS + MBS)
  - Discount Rate: 5% for costs and health outcomes
  - Preferred Model: Matched to disease progression and clinical pathway
  - Utility Measurement: EQ-5D or AQoL (Australian Quality of Life)

### Common Gaps In Protocols
- No Australian QoL instrument (AQoL) data
- Comparator not on PBS
- Missing Australian healthcare resource use data
- High discount rate means long-term benefits discounted heavily


## Arzneimittelmarktneuordnungsgesetz (German Drug Market Restructuring Act) (Germany)
- **Manual URL**: 

### Process
**Timeline:**
  - Day 0: Market entry at manufacturer's price
  - Month 3: Dossier submission to G-BA
  - Month 6: IQWiG assessment report published
  - Month 9: G-BA decision on added benefit
  - Month 12: Price negotiation with GKV-SV completed
  - Month 15: Arbitration if no agreement
**Price Impact:**
  - Major Benefit: Premium price negotiable
  - Considerable Benefit: Good price achievable
  - Minor Benefit: Moderate premium
  - No Added Benefit: Price capped at comparator therapy cost

### Common Gaps In Protocols
- Study comparator does not match G-BA's appropriate comparator therapy
- Endpoints are surrogates rather than patient-relevant
- No quality of life data collected
- Missing mortality and morbidity endpoints
- Study population does not match German treatment landscape


## Haute Autorité de Santé (France)
- **Manual URL**: 

### Appraisal Types
- Transparency Committee (CT) Assessment
- Economic and Public Health Assessment (CEESP)

### Smr Rating
- Description: Service Médical Rendu — determines reimbursement eligibility
**Levels:**
  - Sufficient (Major/Important/Moderate/Low)
  - Insufficient (no reimbursement)
**Factors:**
  - Severity of disease
  - Efficacy
  - Safety
  - Place in therapeutic strategy
  - Public health impact

### Asmr Rating
- Description: Amélioration du Service Médical Rendu — determines price premium
**Levels:**
  - Level: ASMR I
  - Description: Major improvement

  - Level: ASMR II
  - Description: Important improvement

  - Level: ASMR III
  - Description: Moderate improvement

  - Level: ASMR IV
  - Description: Minor improvement

  - Level: ASMR V
  - Description: No improvement (price = comparator)

- Note: ASMR I-III allow premium pricing; ASMR IV modest premium; ASMR V price at comparator level

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: RCTs with active comparator reflecting French clinical practice
  - Comparator: French standard of care as defined by CT; must match what French clinicians use
  **Endpoints Required:**
    - Mortality (overall survival)
    - Morbidity with validated instruments
    - Quality of life (disease-specific and generic)
    - Safety profile
  **French Specific:**
    - Clinical benefit vs. existing therapies in French treatment landscape
    - Absolute benefit assessment (SMR), not just comparative (ASMR)
    - Public health interest assessment for population-level impact
**Economic Evaluation:**
  - When Required: CEESP assessment required for products claiming ASMR I-III or significant budget impact
  - Perspective: Collective perspective (societal preferred, healthcare system accepted)
  - Discount Rate: 2.5% for costs and outcomes (differs from NICE 3.5%)
  - Modelling: Cost-effectiveness or cost-utility analysis (QALY)
  - Utility Instrument: EQ-5D or HUI accepted; French tariff preferred

### Common Gaps In Protocols
- Comparator not matching French clinical practice (most common gap)
- No quality of life data collection in clinical trial
- Missing assessment of place in therapeutic strategy for France
- Surrogate endpoints without clinical outcome validation
- No French sites or French patient subgroup in MRCT
- Insufficient long-term follow-up data for CEESP economic modelling


## Agenzia Italiana del Farmaco (Italy)
- **Manual URL**: 

### Appraisal Types
- Pricing and Reimbursement Negotiation
- Managed Entry Agreement (MEA)

### Innovative Therapy
- Description: Full Innovation designation provides automatic regional reimbursement + dedicated fund
**Criteria:**
  - Unmet therapeutic need
  - Added therapeutic value
  - Quality of evidence
**Levels:**
  - Full Innovation (highest — automatic reimbursement)
  - Conditional Innovation
  - No Innovation
- Benefit: Full Innovation: automatic listing on regional formularies, dedicated innovation fund (€1B/year)

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: RCTs demonstrating clinical benefit over available therapies in Italy
  - Comparator: Italian standard of care (may differ from other EU countries)
  **Endpoints Required:**
    - Overall survival or other hard clinical endpoints
    - Quality of life (generic and disease-specific)
    - Clinically meaningful benefit thresholds
**Managed Entry Agreements:**
  - Description: Italy is a global leader in MEAs — most new drugs negotiated under some form of MEA
  **Types:**
    - Type: Payment by Results
    - Description: Full/partial refund if patient does not respond

    - Type: Risk Sharing
    - Description: Discount applied proportional to non-responders

    - Type: Cost Sharing
    - Description: Discount on initial treatment period

    - Type: Capping
    - Description: Maximum expenditure per patient

    - Type: Success Fee
    - Description: Payment only upon treatment success

  - Registry: AIFA Monitoring Registry (Registri di Monitoraggio) required for MEA tracking
  - Protocol Impact: Trials must define clear responder criteria to support outcome-based MEAs

### Common Gaps In Protocols
- No clear responder definition to support payment-by-results MEA
- Missing early response biomarker for cost-sharing trigger
- No Italian sites in MRCT (limits innovation designation)
- Insufficient real-world evidence plan for registry monitoring
- Comparator not available/standard in Italy


## EU Joint Clinical Assessment ()
- **Manual URL**: 

### Scope
**Phase 1 From 2025:**
  - Oncology products
  - ATMPs (Advanced Therapy Medicinal Products)
**Phase 2 From 2028:**
  - Orphan medicinal products
**Phase 3 From 2030:**
  - All new active substances and new therapeutic indications

### Assessment Elements
**Mandatory:**
  - Description of the health condition and current clinical management
  - Description of the health technology
  - Relative clinical effectiveness vs appropriate comparator(s)
  - Relative safety
- Not Included: Health economic evaluation, budget impact, pricing — remains at national level

### Evidence Requirements
- Comparator: Must address comparators relevant across EU member states — may need multiple comparators
- Population: EU-wide population; may need to address country-specific subgroups
**Endpoints:**
  - Patient-relevant clinical outcomes (survival, morbidity, HRQoL)
  - Validated instruments for QoL
  - Safety assessment
**Methodological Standards:**
  - PICO framework mandatory (Population, Intervention, Comparator, Outcomes)
  - Pre-submission evidence gap analysis recommended
  - Joint scientific consultation available (replaces individual national consultations for JCA scope)
  - Compliance with EU methodological guidelines

### Impact On Protocol Design
- Single comparator may not satisfy all EU member states — multi-arm or NMA strategy needed
- Endpoints must be patient-relevant (surrogates challenged by IQWiG tradition will apply EU-wide)
- QoL measurement mandatory from trial start
- Subgroup analyses by EU-relevant factors (age, severity, prior treatment)
- Evidence must be submitted in EU standardized JCA format

### Common Gaps In Protocols
- Single comparator that doesn't match all EU national standards of care
- Reliance on surrogate endpoints without validated link to patient-relevant outcomes
- No EU-wide QoL data collection strategy
- Missing subgroup analyses relevant to diverse EU treatment landscapes
- No plan for joint scientific consultation during protocol development


## Tandvårds- och läkemedelsförmånsverket (Dental and Pharmaceutical Benefits Agency) (Sweden)
- **Manual URL**: 

### Evidence Requirements
**Cost Effectiveness:**
  - Threshold: No formal threshold; ~SEK 500,000-1,000,000/QALY (~€45,000-90,000) typically accepted for severe diseases
  - Perspective: Societal perspective (includes productivity losses)
  - Discount Rate: 3% for costs and outcomes
**Clinical Effectiveness:**
  - Preferred Evidence: RCT with active comparator
  - Comparator: Swedish clinical practice standard of care


## Health Insurance Review and Assessment Service (South Korea)
- **Manual URL**: 

### Evidence Requirements
**Cost Effectiveness:**
  - Threshold: GDP per capita per QALY (~₩40,000,000, ~$30,000 USD) informally applied
  - Perspective: National Health Insurance perspective
  - Discount Rate: 5% for costs and outcomes
**Special Considerations:**
  - Risk-sharing agreements available for high-cost therapies
  - Korean patient subgroup data from MRCT preferred
  - PK/PD bridging data in Korean population may be requested


## Comissão Nacional de Incorporação de Tecnologias no SUS (Brazil)
- **Manual URL**: 

### Evidence Requirements
**Clinical Effectiveness:**
  - Preferred Evidence: Systematic review with meta-analysis of RCTs
  - Comparator: Technology available in SUS (public health system)
**Cost Effectiveness:**
  - Threshold: Approximately 3x GDP per capita (~R$150,000/QALY)
  - Perspective: SUS (public healthcare system)
  - Discount Rate: 5% for costs and outcomes
**Special Considerations:**
  - Brazilian patient data or Latin American population representation valued
  - Public consultation process before final recommendation
  - Litigation risk: patients may access non-listed drugs via court orders (judicialização)
