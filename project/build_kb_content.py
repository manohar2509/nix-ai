#!/usr/bin/env python3
"""
NIX AI — Knowledge Base Content Builder

Converts the structured JSON reference files into optimised text documents
that can be uploaded to the S3 KB bucket and indexed by Bedrock Knowledge Base.

Bedrock KB indexes text/markdown best, so we transform our structured JSON
into rich, searchable text documents with clear section headers.

Usage:
    python build_kb_content.py                    # Build all KB text files
    python build_kb_content.py --upload            # Build and upload to S3
    python build_kb_content.py --output ./output   # Custom output directory
"""

import json
import os
import sys
from pathlib import Path


# ── Paths ────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
KB_JSON_DIR = SCRIPT_DIR / "knowledge_base"
OUTPUT_DIR = SCRIPT_DIR / "knowledge_base" / "kb_ready"


def build_ich_guidelines_doc(data: dict) -> str:
    """Build searchable text document from ICH guidelines JSON."""
    lines = [
        "# ICH Harmonised Guidelines — Complete Reference",
        "",
        "This document contains the complete ICH guideline database used by NIX AI",
        "for clinical trial protocol analysis, compliance scoring, and citation.",
        "",
    ]

    # The JSON uses top-level keys like 'efficacy_guidelines', 'safety_guidelines', etc.
    series_map = {
        "efficacy_guidelines": "Efficacy Guidelines (E-Series)",
        "safety_guidelines": "Safety Guidelines (S-Series)",
        "quality_guidelines": "Quality Guidelines (Q-Series)",
        "multidisciplinary_guidelines": "Multidisciplinary Guidelines (M-Series)",
    }

    for series_key, series_label in series_map.items():
        series_data = data.get(series_key, {})
        if not series_data:
            continue

        lines.append(f"\n## {series_label}")
        lines.append("")

        for code, guideline in series_data.items():
            if not isinstance(guideline, dict):
                continue
            title = guideline.get("title", "")
            url = guideline.get("url", "")
            focus = guideline.get("focus", "")
            status = guideline.get("status", "")
            effective = guideline.get("effective_date", "")

            lines.append(f"### ICH {code}: {title}")
            if url:
                lines.append(f"- **URL**: {url}")
            if focus:
                lines.append(f"- **Focus**: {focus}")
            if status:
                lines.append(f"- **Status**: {status}")
            if effective:
                lines.append(f"- **Effective Date**: {effective}")

            # Key sections
            for section in guideline.get("key_sections", []):
                sec_num = section.get("section", "")
                sec_title = section.get("title", "")
                reqs = section.get("requirements", [])
                lines.append(f"\n  **Section {sec_num}: {sec_title}**")
                for req in reqs:
                    lines.append(f"  - {req}")

            # Compliance criteria
            criteria = guideline.get("compliance_criteria", {})
            if criteria:
                lines.append(f"\n  **Compliance Criteria for ICH {code}:**")
                if isinstance(criteria, dict):
                    for severity, items in criteria.items():
                        if isinstance(items, list):
                            lines.append(f"  {severity.upper()}:")
                            for item in items:
                                lines.append(f"    - {item}")
                        else:
                            lines.append(f"  - {severity}: {items}")
                elif isinstance(criteria, list):
                    for c in criteria:
                        lines.append(f"  - {c}")

            lines.append("")

    return "\n".join(lines)


def build_fda_guidance_doc(data: dict) -> str:
    """Build searchable text document from FDA guidance JSON."""
    lines = [
        "# FDA Guidance Documents — Clinical Trial Requirements",
        "",
        "Complete FDA guidance reference for clinical trial design, endpoints,",
        "statistical methodology, special populations, and emerging approaches.",
        "",
    ]

    # The JSON uses top-level category keys like 'clinical_trial_design', 'endpoints_and_biomarkers', etc.
    for category_key, category_data in data.items():
        if category_key == "metadata" or not isinstance(category_data, dict):
            continue
        lines.append(f"\n## {category_key.replace('_', ' ').title()}")
        lines.append("")

        for guidance_key, guidance in category_data.items():
            if not isinstance(guidance, dict):
                continue
            title = guidance.get("title", guidance_key.replace("_", " ").title())
            url = guidance.get("url", "")
            year = guidance.get("year", "")

            lines.append(f"### {title}" + (f" ({year})" if year else ""))
            if url:
                lines.append(f"- **URL**: {url}")

            # Flatten all guidance content
            for sub_key, sub_val in guidance.items():
                if sub_key in ("title", "url", "year", "issuer"):
                    continue
                label = sub_key.replace("_", " ").title()
                if isinstance(sub_val, list):
                    lines.append(f"\n  **{label}:**")
                    for item in sub_val:
                        if isinstance(item, dict):
                            for ik, iv in item.items():
                                lines.append(f"  - {ik}: {iv}")
                        else:
                            lines.append(f"  - {item}")
                elif isinstance(sub_val, dict):
                    lines.append(f"\n  **{label}:**")
                    _flatten_dict_to_text(sub_val, lines, indent=1)
                elif isinstance(sub_val, str) and len(sub_val) > 0:
                    lines.append(f"- **{label}**: {sub_val}")

            lines.append("")

    return "\n".join(lines)


def build_hta_doc(data: dict) -> str:
    """Build searchable text document from HTA requirements JSON."""
    lines = [
        "# Health Technology Assessment Body Requirements",
        "",
        "Evidence requirements from NICE, IQWiG, CADTH, PBAC, and AMNOG",
        "for market access and reimbursement submissions.",
        "",
    ]

    for body_key, body_data in data.get("hta_bodies", {}).items():
        name = body_data.get("full_name", body_key)
        country = body_data.get("country", "")
        url = body_data.get("manual_url", "")

        lines.append(f"\n## {name} ({country})")
        lines.append(f"- **Manual URL**: {url}")
        lines.append("")

        # Flatten all nested data into searchable text
        for req_key, req_data in body_data.items():
            if isinstance(req_data, dict):
                lines.append(f"### {req_key.replace('_', ' ').title()}")
                _flatten_dict_to_text(req_data, lines, indent=0)
                lines.append("")
            elif isinstance(req_data, list):
                lines.append(f"### {req_key.replace('_', ' ').title()}")
                for item in req_data:
                    lines.append(f"- {item}")
                lines.append("")

    return "\n".join(lines)


def build_clinical_standards_doc(data: dict) -> str:
    """Build searchable text from clinical trial design standards JSON."""
    lines = [
        "# Clinical Trial Design Standards & Quality Scoring",
        "",
        "Protocol essential elements, therapeutic area standards,",
        "and quality scoring rubrics per ICH M11 and E6(R3).",
        "",
    ]

    _flatten_dict_to_text(data, lines, indent=0)
    return "\n".join(lines)


def build_therapeutic_benchmarks_doc(data: dict) -> str:
    """Build searchable text from therapeutic area benchmarks JSON."""
    lines = [
        "# Therapeutic Area Benchmarks — Protocol Quality Standards",
        "",
        "Evidence-based benchmarks by therapeutic area for protocol",
        "quality assessment, endpoints, sample sizes, and success rates.",
        "",
    ]

    for area_key, area_data in data.items():
        if area_key == "metadata" or area_key == "quality_scoring_benchmarks":
            continue
        lines.append(f"\n## {area_key.replace('_', ' ').title()}")
        _flatten_dict_to_text(area_data, lines, indent=0)
        lines.append("")

    # Quality scoring
    scoring = data.get("quality_scoring_benchmarks", {})
    if scoring:
        lines.append("\n## Quality Scoring Benchmarks")
        _flatten_dict_to_text(scoring, lines, indent=0)

    return "\n".join(lines)


def build_payer_frameworks_doc(data: dict) -> str:
    """Build searchable text from payer evidence frameworks JSON."""
    lines = [
        "# Payer Evidence Frameworks — Market Access Requirements",
        "",
        "Detailed evidence requirements from major payer bodies worldwide.",
        "Designed to optimise protocols for regulatory AND market access.",
        "",
    ]

    for key, value in data.items():
        if key == "metadata":
            continue
        lines.append(f"\n## {key.replace('_', ' ').title()}")
        if isinstance(value, dict):
            _flatten_dict_to_text(value, lines, indent=0)
        elif isinstance(value, list):
            for item in value:
                lines.append(f"- {item}")
        else:
            lines.append(str(value))
        lines.append("")

    return "\n".join(lines)


def build_ema_doc(data: dict) -> str:
    """Build searchable text from EMA scientific guidelines JSON."""
    lines = [
        "# EMA Scientific Guidelines — EU Clinical Trial Requirements",
        "",
        "Comprehensive EMA/CHMP scientific guidelines for clinical trial",
        "design, conduct, and regulatory submissions in the European Union.",
        "",
    ]

    for key, value in data.items():
        if key == "metadata":
            continue
        lines.append(f"\n## {key.replace('_', ' ').title()}")
        if isinstance(value, dict):
            _flatten_dict_to_text(value, lines, indent=0)
        elif isinstance(value, list):
            for item in value:
                lines.append(f"- {item}")
        lines.append("")

    return "\n".join(lines)


def build_citation_db_doc(data: dict) -> str:
    """Build searchable text from citation reference database JSON."""
    lines = [
        "# Master Citation Reference Database — NIX AI",
        "",
        "Comprehensive citation database with verified URLs for",
        "grounding all NIX AI responses with authoritative sources.",
        "",
    ]

    for cat_key, cat_data in data.get("citation_categories", {}).items():
        desc = cat_data.get("description", "")
        lines.append(f"\n## {cat_key.replace('_', ' ').title()}")
        lines.append(f"{desc}")
        lines.append("")

        for citation in cat_data.get("citations", []):
            code = citation.get("code", "")
            title = citation.get("title", "")
            url = citation.get("url", "")
            issuer = citation.get("issuer", "")
            lines.append(f"- **{code}**: {title}")
            lines.append(f"  URL: {url}")
            if issuer:
                lines.append(f"  Issuer: {issuer}")

        lines.append("")

    # Citation quality rules
    rules = data.get("citation_quality_rules", {})
    if rules:
        lines.append("\n## Citation Quality Rules")
        for rule in rules.get("rules", []):
            lines.append(f"- {rule}")
        lines.append("\n### Authority Hierarchy")
        for level in rules.get("authority_hierarchy", []):
            lines.append(f"  {level}")

    return "\n".join(lines)


def build_regional_regulatory_doc(data: dict) -> str:
    """Build searchable text from regional regulatory requirements JSON."""
    lines = [
        "# Regional Regulatory Requirements — Multi-Jurisdiction Assessment",
        "",
        "Region-specific regulatory requirements for clinical trial protocols",
        "across FDA, EMA, PMDA, NMPA, Health Canada, and MHRA.",
        "",
    ]

    jurisdictions = data.get("jurisdictions", {})
    for code, info in jurisdictions.items():
        full_name = info.get("full_name", code)
        country = info.get("country", "")
        website = info.get("website", "")

        lines.append(f"\n## {full_name} ({country})")
        if website:
            lines.append(f"- **Website**: {website}")

        # Regulatory framework
        framework = info.get("regulatory_framework", {})
        if framework:
            lines.append("\n### Regulatory Framework")
            for key, val in framework.items():
                label = key.replace("_", " ").title()
                lines.append(f"- {label}: {val}")

        # Key requirements
        key_reqs = info.get("key_requirements", {})
        if key_reqs:
            lines.append("\n### Key Requirements")
            _flatten_dict_to_text(key_reqs, lines, indent=0)

        # Protocol-specific requirements
        proto_reqs = info.get("protocol_specific_requirements", [])
        if proto_reqs:
            lines.append("\n### Protocol-Specific Requirements")
            for req in proto_reqs:
                lines.append(f"- {req}")

        # Common deficiencies
        deficiencies = info.get("common_deficiencies", [])
        if deficiencies:
            lines.append("\n### Common Deficiencies")
            for d in deficiencies:
                lines.append(f"- {d}")

        lines.append("")

    return "\n".join(lines)


def _flatten_dict_to_text(d: dict, lines: list, indent: int = 0) -> None:
    """Recursively flatten a dict into readable text lines."""
    prefix = "  " * indent
    for key, value in d.items():
        label = key.replace("_", " ").title()
        if isinstance(value, dict):
            lines.append(f"{prefix}**{label}:**")
            _flatten_dict_to_text(value, lines, indent + 1)
        elif isinstance(value, list):
            lines.append(f"{prefix}**{label}:**")
            for item in value:
                if isinstance(item, dict):
                    _flatten_dict_to_text(item, lines, indent + 1)
                    lines.append("")
                else:
                    lines.append(f"{prefix}  - {item}")
        else:
            lines.append(f"{prefix}- {label}: {value}")


def build_fda_cfr_doc(data: dict) -> str:
    """Build searchable text from FDA CFR regulations JSON."""
    lines = [
        "# FDA Code of Federal Regulations (21 CFR) — Legally Binding Requirements",
        "",
        "This document contains the key FDA regulations from Title 21 of the Code of",
        "Federal Regulations that are legally binding for all clinical trials in the US.",
        "These are NOT guidance — they are enforceable law.",
        "",
    ]

    for key, value in data.items():
        if key == "metadata":
            continue
        lines.append(f"\n## {key.replace('_', ' ').title()}")
        if isinstance(value, dict):
            _flatten_dict_to_text(value, lines, indent=0)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    _flatten_dict_to_text(item, lines, indent=0)
                    lines.append("")
                else:
                    lines.append(f"- {item}")
        else:
            lines.append(str(value))
        lines.append("")

    return "\n".join(lines)


def build_gcp_checklist_doc(data: dict) -> str:
    """Build searchable text from GCP compliance checklist JSON."""
    lines = [
        "# GCP Compliance Checklist — Protocol Quality Assessment",
        "",
        "Systematic GCP compliance checklist aligned with ICH M11 protocol structure",
        "and ICH E6(R3). Used for weighted protocol quality scoring and deficiency identification.",
        "",
    ]

    # Protocol structure checklist
    checklist = data.get("protocol_structure_checklist", {})
    if checklist:
        lines.append("\n## Protocol Structure Checklist (ICH M11 Aligned)")
        lines.append(f"Reference: {checklist.get('reference', '')}")
        lines.append("")

        sections = checklist.get("sections", {})
        for section_key, section_data in sections.items():
            if not isinstance(section_data, dict):
                continue
            section_title = section_key.replace("_", " ").title()
            weight = section_data.get("weight", "")

            lines.append(f"### {section_title} (Weight: {weight})")
            elements = section_data.get("required_elements", [])
            for elem in elements:
                if isinstance(elem, dict):
                    name = elem.get("element", "")
                    severity = elem.get("severity", "")
                    ref = elem.get("guideline", "")
                    lines.append(f"- [{severity.upper()}] {name}")
                    if ref:
                        lines.append(f"  Reference: {ref}")
                else:
                    lines.append(f"- {elem}")
            lines.append("")

    # Jurisdiction-specific checklists
    juris_checks = data.get("jurisdiction_specific_checklist", {})
    if juris_checks:
        lines.append("\n## Jurisdiction-Specific Compliance Checklists")
        for juris_key, juris_data in juris_checks.items():
            if juris_key == "description" or not isinstance(juris_data, dict):
                continue
            lines.append(f"\n### {juris_key.replace('_', ' ').title()}")
            for req in juris_data.get("requirements", []):
                if isinstance(req, dict):
                    item = req.get("element", "")
                    severity = req.get("severity", "")
                    ref = req.get("guideline", "")
                    lines.append(f"- [{severity.upper()}] {item}")
                    if ref:
                        lines.append(f"  Regulation: {ref}")
                else:
                    lines.append(f"- {req}")
            lines.append("")

    # Scoring algorithm
    scoring = data.get("scoring_algorithm", {})
    if scoring:
        lines.append("\n## Scoring Algorithm")
        _flatten_dict_to_text(scoring, lines, indent=0)

    # Common deficiencies
    deficiencies_section = data.get("common_protocol_deficiencies", {})
    deficiencies = deficiencies_section.get("top_deficiencies", []) if isinstance(deficiencies_section, dict) else []
    if deficiencies:
        lines.append("\n## Top Common Protocol Deficiencies")
        for d in deficiencies:
            if isinstance(d, dict):
                rank = d.get("rank", "")
                deficiency = d.get("deficiency", "")
                impact = d.get("impact", "")
                fix = d.get("fix", "")
                lines.append(f"\n**#{rank}: {deficiency}**")
                lines.append(f"- Impact: {impact}")
                if fix:
                    lines.append(f"- Fix: {fix}")
            else:
                lines.append(f"- {d}")

    return "\n".join(lines)


def main():
    output_dir = OUTPUT_DIR
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_dir = Path(sys.argv[idx + 1])

    output_dir.mkdir(parents=True, exist_ok=True)

    # Map JSON files to builder functions and their KB category for metadata
    # Category determines how Bedrock RAG prioritises and labels sources:
    #   regulatory = Legally binding or near-binding standards (ICH, FDA, EMA)
    #   guideline  = Best practice recommendations, checklists, quality criteria
    #   reference  = Benchmarks, citation databases, supporting data
    builders = {
        "ich_guidelines_complete.json": ("01_ich_guidelines.md", build_ich_guidelines_doc, "regulatory"),
        "fda_guidance_clinical_trials.json": ("02_fda_guidance.md", build_fda_guidance_doc, "regulatory"),
        "hta_body_requirements.json": ("03_hta_requirements.md", build_hta_doc, "guideline"),
        "clinical_trial_design_standards.json": ("04_clinical_standards.md", build_clinical_standards_doc, "guideline"),
        "therapeutic_area_benchmarks.json": ("05_therapeutic_benchmarks.md", build_therapeutic_benchmarks_doc, "reference"),
        "payer_evidence_frameworks.json": ("06_payer_frameworks.md", build_payer_frameworks_doc, "reference"),
        "ema_scientific_guidelines.json": ("07_ema_guidelines.md", build_ema_doc, "regulatory"),
        "citation_reference_database.json": ("08_citation_database.md", build_citation_db_doc, "reference"),
        "regional_regulatory_requirements.json": ("09_regional_regulatory.md", build_regional_regulatory_doc, "regulatory"),
        "fda_cfr_regulations.json": ("10_fda_cfr_regulations.md", build_fda_cfr_doc, "regulatory"),
        "gcp_compliance_checklist.json": ("11_gcp_compliance_checklist.md", build_gcp_checklist_doc, "guideline"),
    }

    total = 0
    for json_file, (output_name, builder_fn, category) in builders.items():
        json_path = KB_JSON_DIR / json_file
        if not json_path.exists():
            print(f"⚠️  Skipping {json_file} — file not found")
            continue

        with open(json_path) as f:
            data = json.load(f)

        text = builder_fn(data)

        # Prepend category metadata header so Bedrock knows the document classification
        metadata_header = (
            f"---\n"
            f"category: {category}\n"
            f"source_file: {json_file}\n"
            f"document_type: knowledge_base_reference\n"
            f"---\n\n"
        )
        text = metadata_header + text

        output_path = output_dir / output_name

        with open(output_path, "w") as f:
            f.write(text)

        size_kb = len(text.encode()) / 1024
        print(f"✅ {output_name}: {size_kb:.1f} KB ({len(text.splitlines())} lines)")
        total += size_kb

    print(f"\n📦 Total KB content: {total:.1f} KB across {len(builders)} documents")
    print(f"📁 Output directory: {output_dir}")

    if "--upload" in sys.argv:
        print("\n🚀 Uploading to S3 KB bucket...")
        try:
            import boto3
            s3 = boto3.client("s3")
            bucket = os.environ.get("KB_BUCKET_NAME", "nixai-clinical-kb")
            uploaded_files = []
            for md_file in output_dir.glob("*.md"):
                # IMPORTANT: Use 'documents/' prefix to match admin UI presigned URL path.
                # Bedrock data source indexes the entire bucket — all files MUST live
                # under a consistent prefix so sync, delete, and replace all work correctly.
                key = f"documents/{md_file.name}"
                file_size = md_file.stat().st_size
                s3.upload_file(str(md_file), bucket, key, ExtraArgs={"ContentType": "text/markdown"})
                uploaded_files.append((md_file.name, key, file_size))
                print(f"  ✅ s3://{bucket}/{key}")
            print("\n✅ Upload complete!")
        except Exception as exc:
            print(f"  ❌ Upload failed: {exc}")
            print("  Set KB_BUCKET_NAME env var and ensure AWS credentials are configured.")
            uploaded_files = []

        # Auto-register in DynamoDB so files appear in the admin UI immediately
        if uploaded_files and "--register" not in sys.argv or "--register" in sys.argv:
            print("\n📋 Registering files in DynamoDB...")
            try:
                backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
                sys.path.insert(0, backend_dir)
                from dotenv import load_dotenv
                load_dotenv(os.path.join(backend_dir, ".env"))

                from app.core.auth import CurrentUser
                from app.services import kb_service

                system_user = CurrentUser(
                    user_id="build-script",
                    email="build@nixai.internal",
                    name="Build Script",
                    groups=["Admin"],
                )
                result = kb_service.reconcile_s3_documents(system_user)
                print(f"  Imported: {result['imported_count']}, "
                      f"Skipped: {result['skipped_count']}, "
                      f"Errors: {result['error_count']}")
                if result["imported"]:
                    for doc in result["imported"]:
                        print(f"    ✅ {doc['name']} → {doc['category']}")
                print("\n✅ Registration complete! Files will appear in the admin UI.")
            except Exception as exc:
                print(f"  ⚠️  DynamoDB registration skipped: {exc}")
                print("  Files are in S3 — use the 'Import from S3' button in the admin UI to register them.")

        print("\nRun a KB sync to index the new content in Bedrock.")


if __name__ == "__main__":
    main()
