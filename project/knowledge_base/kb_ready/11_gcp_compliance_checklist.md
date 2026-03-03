---
category: guideline
source_file: gcp_compliance_checklist.json
document_type: knowledge_base_reference
---

# GCP Compliance Checklist — Protocol Quality Assessment

Systematic GCP compliance checklist aligned with ICH M11 protocol structure
and ICH E6(R3). Used for weighted protocol quality scoring and deficiency identification.


## Protocol Structure Checklist (ICH M11 Aligned)
Reference: ICH M11 Step 4 (2024)

### Title Page (Weight: 2)
- [CRITICAL] Protocol title (descriptive, including study drug and condition)
  Reference: ICH M11 Section 1
- [CRITICAL] Protocol identifier/number
  Reference: ICH M11 Section 1
- [CRITICAL] Version number and date
  Reference: ICH M11 Section 1
- [MAJOR] Sponsor name and address
  Reference: ICH M11 Section 1
- [MAJOR] EudraCT/CTIS number (if EU trial)
  Reference: EU CTR 536/2014
- [MAJOR] IND number (if US trial)
  Reference: 21 CFR 312.23
- [MAJOR] Coordinating investigator name and affiliation
  Reference: ICH E6(R3) Section 4

### Synopsis (Weight: 3)
- [CRITICAL] Brief study summary covering all key design elements
  Reference: ICH M11 Section 2
- [CRITICAL] Study title
- [CRITICAL] Study phase
- [CRITICAL] Study design (parallel, crossover, adaptive, etc.)
- [CRITICAL] Primary objective and endpoint
- [CRITICAL] Number of subjects
- [MAJOR] Study duration
- [MAJOR] Study population summary
- [MAJOR] Key inclusion/exclusion criteria
- [MAJOR] Statistical methods summary

### Schedule Of Activities (Weight: 5)
- [CRITICAL] Tabular schedule of all study visits and assessments
  Reference: ICH M11 Section 3
- [CRITICAL] Screening period assessments
- [CRITICAL] Treatment period visits and assessments
- [CRITICAL] Follow-up period assessments
- [MAJOR] Visit windows (acceptable timeframes)
- [CRITICAL] Safety assessments at each visit
- [MAJOR] PRO/QoL collection timepoints
  Reference: NICE PMG36
- [MAJOR] EQ-5D-5L collection timepoints
  Reference: NICE/IQWiG requirement
- [MAJOR] Lab assessments schedule
- [MAJOR] PK sampling timepoints (if applicable)
- [MAJOR] ECG assessment schedule
  Reference: ICH E14

### Introduction (Weight: 5)
- [CRITICAL] Disease/condition background with epidemiology
  Reference: ICH M11 Section 4
- [CRITICAL] Current standard of care description
- [CRITICAL] Unmet medical need justification
- [MAJOR] Nonclinical data summary
- [MAJOR] Clinical data summary from prior studies
- [MAJOR] Study drug mechanism of action
- [CRITICAL] Known and potential risks
  Reference: ICH E6(R3) Section 6.2
- [CRITICAL] Known and potential benefits
- [CRITICAL] Benefit-risk assessment
  Reference: ICH E6(R3) Section 6.2

### Objectives Endpoints Estimands (Weight: 15)
- [CRITICAL] Primary objective clearly stated
  Reference: ICH M11 Section 5
- [CRITICAL] Primary endpoint with precise definition and measurement method
- [CRITICAL] Primary estimand with all 5 attributes (per ICH E9(R1))
  Reference: ICH E9(R1)
- [CRITICAL] Estimand attribute 1: Population
  Reference: ICH E9(R1) A.2.2
- [CRITICAL] Estimand attribute 2: Treatment (intervention and comparator)
  Reference: ICH E9(R1) A.2
- [CRITICAL] Estimand attribute 3: Variable (endpoint)
  Reference: ICH E9(R1) A.2.3
- [CRITICAL] Estimand attribute 4: Intercurrent events and strategies
  Reference: ICH E9(R1) A.2.4
- [CRITICAL] Estimand attribute 5: Population-level summary measure
  Reference: ICH E9(R1) A.2.5
- [MAJOR] Secondary objectives and endpoints
- [MINOR] Exploratory objectives and endpoints
- [CRITICAL] Safety objectives
- [CRITICAL] Endpoint alignment with regulatory guidance for indication
- [MAJOR] Endpoint validation status documented
- [MAJOR] Patient-reported outcome endpoints included
  Reference: FDA PRO Guidance / NICE PMG36
- [MAJOR] Health economic endpoints (resource use)
  Reference: NICE/IQWiG/CADTH requirement

### Study Design (Weight: 15)
- [CRITICAL] Study design type clearly specified
  Reference: ICH M11 Section 6
- [MAJOR] Study schematic/flow diagram
- [CRITICAL] Randomisation method and ratio
- [MAJOR] Stratification factors (limited to 2-3, clinically relevant)
- [CRITICAL] Blinding level with justification
- [CRITICAL] Emergency unblinding procedures
  Reference: ICH E6(R3)
- [CRITICAL] Control arm selection justified per ICH E10
  Reference: ICH E10
- [CRITICAL] Comparator reflects standard of care
  Reference: ICH E10 / HTA bodies
- [MAJOR] Treatment duration justified
- [CRITICAL] Follow-up duration adequate for endpoints
- [MINOR] Run-in period described (if applicable)
- [CRITICAL] Adaptive design elements pre-specified (if applicable)
  Reference: ICH E20 / FDA Adaptive Designs
- [CRITICAL] Dose selection rationale documented
  Reference: ICH E4 / FDA Project Optimus

### Study Population (Weight: 10)
- [CRITICAL] Target population clearly described
  Reference: ICH M11 Section 7
- [CRITICAL] Specific, measurable inclusion criteria
- [CRITICAL] Scientifically justified exclusion criteria
- [MAJOR] No arbitrary upper age limits (per ICH E7)
  Reference: ICH E7
- [MAJOR] Diversity plan / enrollment targets for underrepresented populations
  Reference: FDA Diversity Plans 2024
- [MINOR] Screen failure rate estimation
- [CRITICAL] Withdrawal/discontinuation criteria specified
- [MAJOR] Replacement policy for dropouts

### Study Intervention (Weight: 8)
- [CRITICAL] Investigational product description
  Reference: ICH M11 Section 8
- [CRITICAL] Dosage, route, frequency, duration
- [CRITICAL] Dose modification/reduction guidelines
- [CRITICAL] Treatment discontinuation criteria
- [CRITICAL] Concomitant medication policy (permitted and prohibited)
- [MAJOR] Rescue medication rules
- [MAJOR] Drug supply, storage, accountability
  Reference: ICH E6(R3) Section 5
- [MAJOR] Treatment compliance monitoring method

### Statistical Considerations (Weight: 15)
- [CRITICAL] Primary analysis method clearly specified
  Reference: ICH M11 Section 12
- [CRITICAL] Sample size calculation with assumptions
- [CRITICAL] Effect size assumption justified from prior data
- [CRITICAL] Power (typically 80-90%)
- [CRITICAL] Significance level (typically two-sided α = 0.05)
- [CRITICAL] Analysis populations defined (ITT, mITT, PP, Safety)
- [CRITICAL] Missing data handling strategy aligned with estimand
  Reference: ICH E9(R1)
- [CRITICAL] Multiplicity adjustment for multiple endpoints/comparisons
  Reference: FDA Multiple Endpoints / EMA CHMP/44762/2017
- [CRITICAL] Interim analysis plan (if applicable)
- [CRITICAL] Stopping rules (efficacy and futility)
- [CRITICAL] DMC/DSMB charter referenced
- [MAJOR] Pre-specified subgroup analyses
- [MAJOR] Sensitivity analyses described
- [MAJOR] Bayesian design elements justified (if applicable)
- [MAJOR] Survival analysis methods (KM, Cox PH) for time-to-event

### Safety Monitoring (Weight: 12)
- [CRITICAL] AE and SAE definitions aligned with ICH E2A
  Reference: ICH E2A
- [CRITICAL] AE grading scale specified (CTCAE v5, MedDRA)
- [CRITICAL] AE collection start and end timepoints
- [CRITICAL] SAE reporting timelines to sponsor
  Reference: ICH E2A / 21 CFR 312.32
- [CRITICAL] SAE reporting timelines to IRB/IEC
- [CRITICAL] SAE reporting timelines to regulators (7-day, 15-day)
  Reference: 21 CFR 312.32 / EU CTR Art 41-43
- [CRITICAL] DSMB/DMC established with charter
  Reference: ICH E6(R3) / FDA DMC Guidance
- [CRITICAL] Stopping rules for safety signals
- [MAJOR] DSUR (Development Safety Update Report) submission plan
  Reference: ICH E2F
- [MAJOR] Cardiac safety monitoring (ECG schedule, QTc)
  Reference: ICH E14 / ICH S7B
- [MAJOR] Pregnancy reporting procedures
- [CRITICAL] Suicidality monitoring (C-SSRS) if CNS drug
- [MAJOR] Hepatotoxicity monitoring (Hy's Law) if hepatotoxic risk
- [MAJOR] Follow-up for ongoing AEs after treatment end

### Data Integrity And Quality (Weight: 5)
- [CRITICAL] Risk-based quality management plan
  Reference: ICH E6(R3) Section 5.0
- [CRITICAL] Critical to Quality (CtQ) factors identified
  Reference: ICH E8(R1)
- [CRITICAL] Risk-based monitoring strategy
  Reference: ICH E6(R3) Section 5.18
- [MAJOR] Data management plan referenced
- [MAJOR] EDC system with Part 11 compliance
  Reference: 21 CFR Part 11
- [MAJOR] Source data verification strategy
- [MAJOR] Audit trail requirements
- [CRITICAL] Data privacy and GDPR compliance (if EU trial)
  Reference: GDPR 2016/679
- [MAJOR] CDISC data standards for submission
  Reference: FDA CDISC requirement

### Ethics And Regulatory (Weight: 5)
- [CRITICAL] Informed consent process described
  Reference: ICH E6(R3) Section 4.8 / 21 CFR Part 50
- [CRITICAL] All 8 basic consent elements addressed
  Reference: 21 CFR 50.25(a)
- [CRITICAL] IRB/IEC approval required before enrollment
  Reference: 21 CFR Part 56
- [CRITICAL] Regulatory submissions plan (IND, CTA, CTN)
- [MAJOR] Protocol amendment procedures
- [MINOR] Publication policy
- [MAJOR] Insurance/indemnity provisions (EU requirement)
  Reference: EU CTR 536/2014
- [CRITICAL] Trial registration (ClinicalTrials.gov / CTIS / ICTRP)


## Jurisdiction-Specific Compliance Checklists

### Fda Specific
- [CRITICAL] IND filed and 30-day review period observed
  Regulation: 21 CFR 312.40
- [CRITICAL] Adequate and well-controlled study design per 21 CFR 314.126
- [MAJOR] CDISC SDTM/ADaM data standards for submission
- [MAJOR] Diversity Action Plan for Phase III trials
  Regulation: FDA 2024
- [MAJOR] Pediatric Study Plan per PREA if applicable
- [MINOR] Special Protocol Assessment (SPA) considered for Phase III
- [CRITICAL] CVOT requirement for diabetes drugs
  Regulation: FDA CVOT Guidance 2008/2020


### Ema Specific
- [CRITICAL] Clinical Trial Application via CTIS portal
  Regulation: EU CTR 536/2014
- [CRITICAL] GDPR-compliant data handling procedures
  Regulation: GDPR 2016/679
- [MAJOR] Paediatric Investigation Plan (PIP) or justified deferral/waiver
  Regulation: EC 1901/2006
- [CRITICAL] Results submission to CTIS within 12 months of trial end
  Regulation: EU CTR Article 37
- [CRITICAL] EU standard of care as comparator
- [MAJOR] Risk Management Plan preparation aligned with pharmacovigilance plan
  Regulation: GVP Module V
- [MAJOR] DSUR to all concerned Member States
  Regulation: ICH E2F


### Pmda Specific
- [CRITICAL] Clinical Trial Notification filed
- [CRITICAL] Japanese population PK/bridging data planned
  Regulation: ICH E5(R1)
- [MAJOR] CYP2C19 polymorphism evaluated
- [MAJOR] Japanese site inclusion in MRCT
  Regulation: ICH E17
- [MAJOR] Body weight-based dosing consideration


### Nmpa Specific
- [CRITICAL] CTA filed with CDE
- [CRITICAL] Chinese population PK data planned
- [MAJOR] Chinese site participation in global trial
- [MAJOR] Minimum Chinese patient enrollment targets
- [MINOR] Traditional medicine interaction consideration if relevant


## Scoring Algorithm
- Description: How NIX AI calculates compliance scores from this checklist
**Methodology:**
  **Element Scoring:**
    - Present And Adequate: 1.0
    - Present But Incomplete: 0.5
    - Missing: 0.0
    - Not Applicable: excluded from calculation
  **Severity Multipliers:**
    - Critical: 3.0
    - Major: 2.0
    - Minor: 1.0
  - Section Score: Sum of (element_score × severity_multiplier) / Sum of (max_score × severity_multiplier) × 100
  - Overall Score: Weighted average of section scores using section weights
  **Interpretation:**
    - 85-100: Excellent — Protocol meets or exceeds all major requirements
    - 70-84: Good — Minor gaps addressable via amendment
    - 50-69: Adequate — Notable deficiencies requiring attention
    - 30-49: Needs Improvement — Significant redesign required
    - 0-29: Major Revision — Fundamental issues in protocol design

## Top Common Protocol Deficiencies

**#1: Missing or incomplete estimand framework (ICH E9(R1))**
- Impact: Regulatory delay — both FDA and EMA now expect estimands in protocol and SAP
- Fix: Define primary estimand with all 5 attributes: population, treatment, variable, intercurrent events + strategies, summary measure

**#2: No EQ-5D-5L or quality of life data collection**
- Impact: Payer rejection — NICE, IQWiG, CADTH all require QoL data for reimbursement assessment
- Fix: Add EQ-5D-5L at baseline and every scheduled visit. Add disease-specific PRO instrument.

**#3: Comparator does not reflect standard of care in target markets**
- Impact: HTA bodies may rule 'no added benefit' — especially IQWiG/G-BA if ACT not matched
- Fix: Engage early with HTA bodies via scientific advice. Consider multi-arm design with HTA-relevant comparator.

**#4: Inadequate sample size justification**
- Impact: FDA clinical hold or EMA request for information — delays trial start
- Fix: Provide effect size justification from prior studies, power calculation with sensitivity analysis, handling of dropouts

**#5: Missing multiplicity adjustment for multiple endpoints**
- Impact: Primary endpoint claims may be rejected if FWER not controlled
- Fix: Pre-specify testing hierarchy, graphical testing procedure, or gatekeeping strategy in protocol and SAP

**#6: No DSMB/DMC charter for Phase III trial**
- Impact: ICH E6(R3) non-compliance — safety oversight gap
- Fix: Establish independent DMC with charter covering interim analyses, safety monitoring, stopping rules

**#7: Dose selection not adequately justified**
- Impact: FDA Project Optimus — oncology drugs especially need multiple dose evaluation data
- Fix: Provide PK/PD modelling, dose-response data, exposure-response analysis supporting selected dose

**#8: Missing diversity enrollment plan**
- Impact: FDA now requires diversity plans for Phase III (since 2024)
- Fix: Include diversity targets, community engagement strategy, site selection for diverse populations

**#9: Insufficient safety follow-up duration**
- Impact: Incomplete safety database for registration — may trigger post-marketing requirements
- Fix: Align follow-up with ICH E1 requirements and therapeutic area standards

**#10: No healthcare resource utilisation data collection**
- Impact: Cannot build cost-effectiveness model for HTA submissions
- Fix: Add resource use CRF fields: hospitalisations, ER visits, outpatient visits, concomitant medications