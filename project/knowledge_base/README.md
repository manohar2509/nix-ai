# NIX AI — Knowledge Base Reference Data

## Overview

This directory contains the comprehensive knowledge base data that powers
NIX AI's clinical trial protocol analysis engine. The data is structured in
JSON format and converted to markdown for Bedrock KB ingestion.

## Architecture

```
knowledge_base/
├── README.md                           ← This file
├── ich_guidelines_complete.json        ← All ICH E/S/Q/M guidelines with sections & compliance criteria
├── fda_guidance_clinical_trials.json   ← FDA guidance: adaptive, NI, master protocols, endpoints, DCT
├── ema_scientific_guidelines.json      ← EMA/CHMP: biostatistics, multiplicity, oncology, rare diseases
├── hta_body_requirements.json          ← NICE, IQWiG/G-BA, CADTH, PBAC evidence requirements
├── clinical_trial_design_standards.json ← Protocol elements per ICH M11, quality scoring rubrics
├── therapeutic_area_benchmarks.json    ← Benchmarks: oncology, CV, neuro, rare disease, metabolic
├── payer_evidence_frameworks.json      ← Cross-market payer requirements, scoring methodology
├── citation_reference_database.json    ← Master citation DB with verified URLs for all sources
└── kb_ready/                           ← Auto-generated markdown files for S3/Bedrock upload
    ├── 01_ich_guidelines.md
    ├── 02_fda_guidance.md
    ├── 03_hta_requirements.md
    ├── 04_clinical_standards.md
    ├── 05_therapeutic_benchmarks.md
    ├── 06_payer_frameworks.md
    ├── 07_ema_guidelines.md
    └── 08_citation_database.md
```

## Data Pipeline

1. **JSON source files** — Structured, version-controlled reference data
2. **`build_kb_content.py`** — Converts JSON → searchable markdown documents
3. **S3 upload** — Markdown files uploaded to `nixai-clinical-kb` S3 bucket
4. **Bedrock KB sync** — Bedrock indexes the documents for RAG retrieval
5. **RAG Chat** — User queries retrieve relevant passages with citations

## Building & Uploading

```bash
# Build markdown files from JSON
python project/build_kb_content.py

# Build and upload to S3 (requires AWS credentials)
KB_BUCKET_NAME=nixai-clinical-kb python project/build_kb_content.py --upload

# Then trigger a KB sync from the admin UI or API
```

## Coverage

| Source | Documents | Guidelines | Status |
|--------|-----------|------------|--------|
| ICH E-Series | 17+ | E1 through E22 | ✅ Complete |
| ICH S-Series | 8+ | S1A through S12 | ✅ Complete |
| ICH Q-Series | 4+ | Q1A(R2), Q8, Q9, Q10 | ✅ Core |
| ICH M-Series | 3 | M4, M11, M14 | ✅ Complete |
| FDA Guidance | 12+ | Adaptive, NI, Master, Endpoints, DCT | ✅ Complete |
| EMA Guidelines | 6+ | CHMP efficacy, oncology, rare, special pathways | ✅ Complete |
| NICE | Full | PMG36, DSU, severity modifier, ICER thresholds | ✅ Complete |
| IQWiG/G-BA | Full | AMNOG, benefit categories, patient-relevant endpoints | ✅ Complete |
| CADTH | Full | Reimbursement review, deliberative framework | ✅ Complete |
| PBAC | Full | PBS guidelines, GRADE framework | ✅ Complete |

## Citation Quality

Every NIX AI response is grounded in these authoritative sources:

1. **ICH Step 4 Guidelines** — Highest authority (globally accepted)
2. **National regulations** — 21 CFR, EU CTR 536/2014, PMD Act
3. **FDA/EMA Final Guidance** — Jurisdiction-specific requirements
4. **HTA Body Manuals** — NICE PMG36, IQWiG Methods v7, CADTH 4th ed.
5. **Clinical trial registries** — ClinicalTrials.gov, EU CTR, WHO ICTRP
