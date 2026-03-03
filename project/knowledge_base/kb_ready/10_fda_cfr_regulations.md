---
category: regulatory
source_file: fda_cfr_regulations.json
document_type: knowledge_base_reference
---

# FDA Code of Federal Regulations (21 CFR) — Legally Binding Requirements

This document contains the key FDA regulations from Title 21 of the Code of
Federal Regulations that are legally binding for all clinical trials in the US.
These are NOT guidance — they are enforceable law.


## 21 Cfr Part 11
- Title: Electronic Records; Electronic Signatures
- Url: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11
- Category: regulatory
- Authority Level: highest
- Description: Requirements for electronic records and electronic signatures to be considered trustworthy, reliable, and equivalent to paper records. Critical for any AI/software system handling clinical trial data.
**Subparts:**
  **Subpart A General:**
    - Title: General Provisions
    **Sections:**
      - 11.1: Scope: Applies to records required by FDA predicate rules that are maintained or submitted electronically
      - 11.2: Implementation: Risk-based approach, narrowed scope per 2003 guidance
      - 11.3: Definitions: Electronic record, electronic signature, digital signature, closed system, open system
  **Subpart B Electronic Records:**
    - Title: Electronic Records
    **Sections:**
      **11.10:**
        - Title: Controls for Closed Systems
        **Requirements:**
          - System validation to ensure accuracy, reliability, consistent intended performance
          - Ability to generate accurate and complete copies of records
          - Protection of records to enable their accurate and ready retrieval throughout the retention period
          - Limiting system access to authorised individuals
          - Use of secure, computer-generated, time-stamped audit trails
          - Audit trails must record date/time of operator entries and actions, identity of operator, and must not obscure previously recorded information
          - Use of operational system checks to enforce permitted sequencing of steps and events
          - Use of authority checks to ensure only authorised individuals can use the system, electronically sign, access operation, input/output device, alter a record, or perform operation at hand
          - Use of device (terminal) checks to determine validity of data input source
          - Determination that persons who develop, maintain, or use electronic record/signature systems have the education, training, and experience to perform their assigned tasks
      **11.30:**
        - Title: Controls for Open Systems
        **Requirements:**
          - All controls from 11.10 plus additional measures
          - Document encryption and digital signature standards
          - Additional security for records transmitted over public networks
      **11.50:**
        - Title: Signature Manifestations
        **Requirements:**
          - Signed electronic records must contain: printed name of signer, date and time of signing, meaning of signature (approval, review, responsibility)
          - Must be subject to same controls as electronic records, included as part of any human-readable form
      **11.70:**
        - Title: Signature/Record Linking
        **Requirements:**
          - Electronic signatures must be linked to their respective electronic records to ensure signatures cannot be excised, copied, or otherwise transferred to falsify another electronic record
  **Subpart C Electronic Signatures:**
    - Title: Electronic Signatures
    **Sections:**
      - 11.100: Each electronic signature must be unique to one individual and must not be reused by, or reassigned to, anyone else
      - 11.200: Electronic signature components: at least two distinct identification components (e.g., user ID + password) for non-biometric; biometric signatures must be designed to ensure they cannot be used by anyone other than their genuine owners
      - 11.300: Controls for identification codes/passwords: maintained by system, aged periodically, recalled/revised following loss, electronic record devices checked for unauthorized use
**Compliance For Clinical Trials:**
  - All EDC (Electronic Data Capture) systems must comply with Part 11
  - ePRO (Electronic Patient-Reported Outcomes) systems must comply
  - CTMS (Clinical Trial Management Systems) must maintain audit trails
  - IRT/IWRS (Interactive Response Technology) systems must comply
  - eConsent systems must meet Part 11 requirements
  - Any AI/ML system generating clinical trial records must comply
  - Data integrity: ALCOA+ principles (Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available)


## 21 Cfr Part 50
- Title: Protection of Human Subjects — Informed Consent
- Url: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-50
- Category: regulatory
- Authority Level: highest
- Description: Federal regulations governing informed consent for clinical trial subjects. Defines the basic and additional elements of informed consent.
**Key Sections:**
  **50.20:**
    - Title: General Requirements for Informed Consent
    **Requirements:**
      - No investigator may involve a human being as a subject in research unless obtaining legally effective informed consent
      - Consent must be sought only under circumstances providing sufficient opportunity to consider participation
      - Consent must be in language understandable to the subject (or legally authorised representative)
      - No informed consent may include exculpatory language that waives subject's legal rights or releases investigator/sponsor/institution from liability for negligence
  **50.25A:**
    - Title: 8 Basic Elements of Informed Consent
    **Elements:**
      - 1. Statement that the study involves research, an explanation of the purposes of the research, the expected duration, a description of the procedures, and identification of any experimental procedures
      - 2. Description of any reasonably foreseeable risks or discomforts to the subject
      - 3. Description of any benefits to the subject or others which may reasonably be expected from the research
      - 4. Disclosure of appropriate alternative procedures or courses of treatment that might be advantageous to the subject
      - 5. Statement describing the extent to which confidentiality of records will be maintained, and that FDA may inspect the records
      - 6. For research involving more than minimal risk: explanation of whether compensation is available, whether medical treatments are available if injury occurs, what they consist of, and where further information may be obtained
      - 7. Explanation of whom to contact for answers about the research, research subjects' rights, and in the event of a research-related injury
      - 8. Statement that participation is voluntary, that refusal to participate will involve no penalty or loss of benefits, and that the subject may discontinue participation at any time without penalty or loss of benefits
  **50.25B:**
    - Title: 6 Additional Elements When Appropriate
    **Elements:**
      - 1. Statement that the treatment or procedure may involve risks to the subject (or embryo/fetus if subject is or may become pregnant) which are currently unforeseeable
      - 2. Anticipated circumstances under which the subject's participation may be terminated by the investigator without the subject's consent
      - 3. Any additional costs to the subject that may result from participation
      - 4. Consequences of a subject's decision to withdraw and procedures for orderly termination of participation
      - 5. Statement that significant new findings developed during the course of the research which may relate to the subject's willingness to continue participation will be provided to the subject
      - 6. Approximate number of subjects involved in the study
  **50.27:**
    - Title: Documentation of Informed Consent
    **Requirements:**
      - Written consent document: either a copy of what the subject signs OR a short form certifying that the elements were presented orally
      - Subject must receive a copy of the consent form
      - IRB-approved consent document required
**Special Populations:**
  **50 Subpart B:**
    - Title: Informed Consent of Prisoners
    - Note: Additional safeguards required for prisoner subjects
  **50 Subpart D:**
    - Title: Additional Safeguards for Children in Clinical Investigations
    **Requirements:**
      - Categories of research risk and prospect of direct benefit
      - Permission of parents/guardians AND assent of child when capable
      - IRB must determine adequacy of provisions for soliciting assent


## 21 Cfr Part 56
- Title: Institutional Review Boards
- Url: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-56
- Category: regulatory
- Authority Level: highest
- Description: Federal regulations governing the composition, function, operations, and responsibilities of Institutional Review Boards (IRBs).
**Key Sections:**
  **56.107:**
    - Title: IRB Membership
    **Requirements:**
      - At least 5 members with varying backgrounds
      - At least one member whose primary concerns are in scientific areas
      - At least one member whose primary concerns are in nonscientific areas
      - At least one member who is not otherwise affiliated with the institution and who is not part of the immediate family of a person affiliated with the institution
      - Diversity in members including consideration of race, gender, cultural backgrounds, and community attitudes
      - No IRB may consist entirely of one profession
  **56.108:**
    - Title: IRB Functions and Operations
    **Requirements:**
      - Written procedures for initial and continuing review of research
      - Written procedures for reporting to institutional officials and FDA
      - Written procedures for determining which projects require review more often than annually
      - Minutes of IRB meetings documenting attendance, actions taken, votes, basis for requiring changes, summary of discussion
  **56.109:**
    - Title: IRB Review of Research
    **Requirements:**
      - Research must be reviewed at convened meeting with majority of members present (quorum)
      - Approval requires majority vote of members present
      - Continuing review: at least once per year
      - Members with conflicts of interest must not participate in review (except to provide information)
  **56.111:**
    - Title: Criteria for IRB Approval of Research
    **Criteria:**
      - Risks to subjects are minimised by using procedures consistent with sound research design
      - Risks to subjects are reasonable in relation to anticipated benefits and the importance of the knowledge expected to result
      - Selection of subjects is equitable, taking into account the purposes of the research, setting, and vulnerability of populations
      - Informed consent will be sought from each prospective subject or legally authorised representative
      - Informed consent will be appropriately documented
      - Where appropriate, the research plan makes adequate provision for monitoring data to ensure safety of subjects
      - Where appropriate, adequate provisions to protect the privacy of subjects and maintain confidentiality of data
      - Additional safeguards included for subjects likely to be vulnerable to coercion or undue influence


## 21 Cfr Part 312
- Title: Investigational New Drug Application (IND)
- Url: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312
- Category: regulatory
- Authority Level: highest
- Description: Regulations governing the IND process, investigator responsibilities, sponsor responsibilities, and safety reporting during clinical investigation.
**Key Sections:**
  **312.20:**
    - Title: Requirement for an IND
    - Requirement: A sponsor must have an IND in effect before beginning a clinical investigation with a drug
  **312.21:**
    - Title: Phases of Investigation
    **Phases:**
      - Phase 1: Initial introduction into humans, 20-80 subjects, primarily PK/PD and safety/tolerability
      - Phase 2: Controlled studies, several hundred subjects, evaluate effectiveness and safety, determine dose
      - Phase 3: Expanded controlled and uncontrolled trials, several hundred to several thousand subjects, confirm effectiveness, monitor adverse reactions, establish dose-response
  **312.23:**
    - Title: IND Content and Format
    **Required Sections:**
      - Form FDA 1571
      - Table of contents
      - Introductory statement and general investigational plan
      - Investigator's Brochure
      - Protocol(s) — per 21 CFR 312.23(a)(6)
      - Chemistry, manufacturing, and controls information
      - Pharmacology and toxicology information
      - Previous human experience with the investigational drug
      - Additional information: drug dependence/abuse potential, radioactive drugs, pediatric studies
  **312.30:**
    - Title: Protocol Amendments
    **Types:**
      - New protocol: requires prior FDA submission (except Phase I with minor modifications)
      - Changes to existing protocol: significant changes require submission as protocol amendment
      - New investigator: may be submitted as protocol amendment
  **312.32:**
    - Title: IND Safety Reporting
    **Requirements:**
      - 7 Day Alert: Written notification within 7 calendar days for fatal or life-threatening suspected adverse reactions
      - 15 Day Report: Written notification within 15 calendar days for serious and unexpected suspected adverse reactions that are both serious and not listed in the Investigator's Brochure
      - Annual Report: Brief report within 60 days of anniversary date of IND's effective date
      - Follow Up: Follow-up information on previously reported safety events submitted as received
      - Investigator Notification: Sponsor must notify all participating investigators of potential serious risks
  **312.42:**
    - Title: Clinical Holds
    **Grounds:**
      - Human subjects would be exposed to an unreasonable and significant risk of illness or injury
      - Clinical investigators are not qualified to conduct the investigation
      - Investigator's Brochure is misleading, erroneous, or materially incomplete
      - IND does not contain sufficient information to assess the risks to subjects (Phase 1)
  **312.50 70:**
    - Title: Responsibilities
    **Sponsor Responsibilities 312 50:**
      - Select qualified investigators
      - Provide investigators with the protocol and Investigator's Brochure
      - Ensure proper monitoring of the investigation
      - Ensure the investigation is conducted in accordance with the plan
      - Maintain adequate records and submit required reports
      - Ensure IRB review and approval
    **Investigator Responsibilities 312 60:**
      - Conduct the investigation in accordance with the signed investigator statement, protocol, and applicable regulations
      - Protect the rights, safety, and welfare of subjects
      - Control investigational drugs
      - Maintain adequate and accurate case histories (source documents)
      - Report adverse events promptly
      - Provide progress reports to sponsor and IRB
    **Monitor Responsibilities 312 70:**
      - Verify accuracy of clinical trial data against source documents
      - Verify informed consent obtained for all subjects
      - Verify investigator compliance with protocol
      - Report findings to sponsor


## 21 Cfr Part 314
- Title: Applications for FDA Approval to Market a New Drug (NDA)
- Url: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314
- Category: regulatory
- Authority Level: highest
**Key Sections:**
  **314.50:**
    - Title: Content and Format of an NDA
    **Required Elements:**
      - Full reports of all clinical investigations
      - Nonclinical pharmacology and toxicology studies
      - Chemistry, manufacturing, and controls data
      - Statistical analyses of clinical data
      - Patent information
      - Proposed labeling
  **314.126:**
    - Title: Adequate and Well-Controlled Studies
    **Design Elements:**
      - Clear statement of objectives and methods of analysis
      - Summary of proposed or actual methods of analysis
      - Design permits valid comparison with a control to provide quantitative assessment of drug effect
      - Method of selection of subjects provides adequate assurance that they have the disease/condition
      - Method of assigning patients to treatment/control groups minimises bias
      - Adequate measures to minimise bias on the part of subjects, observers, analysts
      - Well-defined and reliable methods of assessing subjects' response
      - Analysis of results adequate to assess effects of the drug
    **Acceptable Controls:**
      - Placebo concurrent control
      - Dose-comparison concurrent control
      - No-treatment concurrent control
      - Active treatment concurrent control
      - Historical control (in rare, well-defined circumstances)


## 21 Cfr Part 600 610
- Title: Biologics — BLA Requirements
- Url: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-F
- Category: regulatory
- Authority Level: highest
- Description: Regulations governing biological products including vaccines, blood products, gene therapies, and cellular therapies.
**Key Points:**
  - Biologics License Application (BLA) per 21 CFR 601
  - Establishment standards: manufacturing facility requirements
  - Product standards: identity, strength, quality, purity, potency
  - Labeling requirements specific to biologics
  - Post-marketing reporting: adverse experience reports within 15 days (serious) or annually
  - Biosimilar applications: 351(k) pathway under BPCI Act


## Data Standards Requirements
**Cdisc Standards:**
  - Title: CDISC Data Standards for FDA Submission
  - Url: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/study-data-technical-conformance-guide-technical-specifications-document
  - Description: FDA requires standardised electronic submission data formats for NDA, BLA, and ANDA submissions
  **Standards:**
    - Sdtm: Study Data Tabulation Model — standardised format for clinical study data tabulation datasets
    - Adam: Analysis Data Model — standardised format for analysis-ready datasets
    - Send: Standard for Exchange of Nonclinical Data — for nonclinical study data
    - Define Xml: Define-XML — metadata describing the datasets and variables
  **Requirements:**
    - SDTM datasets required for all NDA/BLA submissions (mandatory since 2017)
    - ADaM datasets required for efficacy and safety analyses
    - Define-XML 2.0 required as dataset documentation
    - Reviewer's Guide for both SDTM and ADaM
    - Controlled Terminology from NCI
    - FDA Study Data Validator for pre-submission checks


## Accelerated Regulatory Pathways
- Description: FDA expedited development and review pathways for serious conditions
**Pathways:**
  **Fast Track:**
    - Title: Fast Track Designation
    - Eligibility: Serious condition AND nonclinical or clinical data demonstrate potential to address unmet medical need
    **Benefits:**
      - Rolling review (submit sections as completed)
      - More frequent FDA meetings and communication
      - Eligibility for accelerated approval and priority review
  **Breakthrough Therapy:**
    - Title: Breakthrough Therapy Designation
    - Eligibility: Serious condition AND preliminary clinical evidence indicates substantial improvement over available therapy on clinically significant endpoint(s)
    **Benefits:**
      - All Fast Track features
      - Intensive FDA guidance on efficient drug development
      - Organisational commitment involving senior managers
      - Eligibility for rolling review
  **Accelerated Approval:**
    - Title: Accelerated Approval (21 CFR 314.500)
    - Eligibility: Serious condition that fills unmet medical need, approval based on surrogate or intermediate clinical endpoint
    **Requirements:**
      - Surrogate endpoint reasonably likely to predict clinical benefit
      - Post-marketing confirmatory trial required (21 CFR 314.510)
      - FDA can require confirmatory study to be underway at time of approval
      - FDORA 2022: FDA now has enhanced authority to withdraw accelerated approval if confirmatory trial not completed
  **Priority Review:**
    - Title: Priority Review Designation
    - Eligibility: Application for drug that treats serious condition AND would provide significant improvement in safety or effectiveness
    - Benefit: FDA review within 6 months (vs standard 10 months)
