"""
NIX AI — Analysis Business Logic

Orchestrates document analysis:
  1. Create a job record (QUEUED)
  2. Push to SQS for the Worker Lambda
  3. Return job ID for polling
"""

from __future__ import annotations

import logging

from app.core.auth import CurrentUser
from app.core.exceptions import AnalysisNotFoundError, DocumentNotFoundError, JobNotFoundError
from app.services import dynamo_service, sqs_service

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════
# ICH GUIDELINE DATABASE (for API responses — REQ-1)
# ════════════════════════════════════════════════════════════════
def get_ich_guidelines() -> list[dict]:
    """Return the master list of ICH guidelines we cross-reference."""
    from app.services.regulatory_engine import ICH_GUIDELINES
    return [
        {"code": code, **info}
        for code, info in ICH_GUIDELINES.items()
    ]


def trigger_analysis(user: CurrentUser, document_id: str, preferences: dict | None = None) -> dict:
    """
    Trigger a new analysis job for a document.

    Two execution modes:
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    • Lambda (production):  Creates DynamoDB job → sends SQS message
                            → Worker Lambda picks it up asynchronously.
    • Local dev (uvicorn):  Creates DynamoDB job → executes analysis
                            task INLINE (no SQS) → returns with final status.
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """
    from app.core.config import get_settings

    settings = get_settings()

    # Verify document exists
    doc = dynamo_service.get_document(document_id)
    if not doc:
        raise DocumentNotFoundError(document_id)

    # Reset document if stuck in "analyzing" or "error" — allows re-analysis
    current_status = doc.get("status", "uploaded")
    if current_status in ("analyzing", "error"):
        logger.info(
            "Resetting document %s from '%s' to 'uploaded' for re-analysis",
            document_id, current_status,
        )
        dynamo_service.update_document(document_id, {"status": "uploaded"})

    # Create job record
    job_params = {"document_id": document_id, "s3_key": doc.get("s3_key", "")}
    if preferences:
        job_params["preferences"] = preferences
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="ANALYZE_DOCUMENT",
        params=job_params,
    )

    # Create analysis record linked to this job
    analysis = dynamo_service.create_analysis(
        doc_id=document_id,
        job_id=job["id"],
    )

    # Update document status
    dynamo_service.update_document(document_id, {
        "status": "analyzing",
        "analysis_id": analysis["id"],
    })

    # ── Decide: SQS (Lambda) or inline (local dev) ──
    if settings.is_lambda:
        # Production path: send to SQS → worker Lambda processes it
        sqs_service.send_analysis_task(
            job_id=job["id"],
            doc_id=document_id,
            s3_key=doc.get("s3_key", ""),
            user_id=user.user_id,
            preferences=preferences,
        )
        logger.info("Analysis job %s queued to SQS", job["id"])
        return {"jobId": job["id"], "status": "QUEUED"}
    else:
        # Local dev path: execute analysis directly (no SQS/Lambda worker)
        logger.info("Running analysis job %s inline (local dev mode)", job["id"])
        return _execute_analysis_inline(job, document_id, doc.get("s3_key", ""), user.user_id, preferences)


def _execute_analysis_inline(job: dict, doc_id: str, s3_key: str, user_id: str, preferences: dict | None = None) -> dict:
    """
    Execute the document analysis task directly in the API process.
    Used in local dev where there is no SQS → Lambda worker.
    """
    job_id = job["id"]
    try:
        from worker.tasks.document_analysis import process_document_analysis

        payload = {
            "job_id": job_id,
            "doc_id": doc_id,
            "s3_key": s3_key,
            "user_id": user_id,
        }
        if preferences:
            payload["preferences"] = preferences
        process_document_analysis(payload)

        # Re-read the job to get final status
        updated = dynamo_service.get_job(job_id)
        final_status = updated.get("status", "COMPLETE") if updated else "COMPLETE"

        return {
            "jobId": job_id,
            "status": final_status,
            "inline": True,  # Signal to frontend: already done, no polling needed
        }
    except Exception as exc:
        logger.error("Inline analysis failed for job %s: %s", job_id, exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        return {
            "jobId": job_id,
            "status": "FAILED",
            "error": str(exc),
            "inline": True,
        }


def get_analysis_status(user: CurrentUser, job_id: str) -> dict:
    """Poll analysis status by job ID with ownership verification."""
    job = dynamo_service.get_job(job_id)
    if not job:
        raise JobNotFoundError(job_id)

    # Verify the caller owns this job
    if job.get("user_id") and job["user_id"] != user.user_id:
        raise JobNotFoundError(job_id)

    return {
        "jobId": job["id"],
        "status": job.get("status", "QUEUED"),
        "progress": job.get("progress", 0),
        "result": job.get("result"),
        "error": job.get("error"),
    }


def get_analysis_results(user: CurrentUser, doc_id: str) -> dict:
    """Get completed analysis results for a document with ownership check."""
    # Verify the caller owns the document
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)
    if doc.get("user_id") and doc["user_id"] != user.user_id:
        raise DocumentNotFoundError(doc_id)

    analysis = dynamo_service.get_analysis_for_document(doc_id)
    if not analysis:
        raise AnalysisNotFoundError(doc_id)

    return {
        "regulatorScore": analysis.get("regulator_score", 0),
        "payerScore": analysis.get("payer_score", 0),
        "findings": analysis.get("findings", []),
        "summary": analysis.get("summary", ""),
        "analyzed_at": analysis.get("completed_at", ""),
        "extraction_method": analysis.get("extraction_method"),
        # REQ-2: Jurisdiction Compass
        "jurisdiction_scores": analysis.get("jurisdiction_scores", []),
        "global_readiness_score": analysis.get("global_readiness_score", 0),
        # REQ-5: Payer Gaps
        "payer_gaps": analysis.get("payer_gaps", []),
        "hta_body_scores": analysis.get("hta_body_scores", {}),
    }


def retry_analysis(user: CurrentUser, job_id: str) -> dict:
    """Retry a failed analysis job.

    Creates a fresh job AND a fresh analysis record, resets the document
    status to 'analyzing', so the full pipeline runs cleanly.
    """
    from app.core.config import get_settings

    settings = get_settings()

    old_job = dynamo_service.get_job(job_id)
    if not old_job:
        raise JobNotFoundError(job_id)

    # Verify ownership
    if old_job.get("user_id") and old_job["user_id"] != user.user_id:
        raise JobNotFoundError(job_id)

    params = old_job.get("params", {})
    document_id = params.get("document_id", "")

    # Create a new job with same params
    new_job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="ANALYZE_DOCUMENT",
        params=params,
    )

    # Create a fresh analysis record and link it to the document
    if document_id:
        analysis = dynamo_service.create_analysis(
            doc_id=document_id,
            job_id=new_job["id"],
        )
        dynamo_service.update_document(document_id, {
            "status": "analyzing",
            "analysis_id": analysis["id"],
        })

    if settings.is_lambda:
        sqs_service.send_analysis_task(
            job_id=new_job["id"],
            doc_id=document_id,
            s3_key=params.get("s3_key", ""),
            user_id=user.user_id,
        )
        return {"jobId": new_job["id"], "status": "QUEUED"}
    else:
        logger.info("Retrying analysis job %s inline (local dev mode)", new_job["id"])
        return _execute_analysis_inline(
            new_job, document_id, params.get("s3_key", ""), user.user_id
        )


# ════════════════════════════════════════════════════════════════
# REQ-3: AMENDMENT IMPACT SIMULATION
# ════════════════════════════════════════════════════════════════
def trigger_simulation(user: CurrentUser, doc_id: str, amendment_text: str) -> dict:
    """Trigger an amendment impact simulation for a document."""
    from app.core.config import get_settings
    settings = get_settings()

    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    # Create job + simulation records
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SIMULATE_AMENDMENT",
        params={"document_id": doc_id, "amendment_text": amendment_text},
    )
    sim = dynamo_service.create_simulation(
        doc_id=doc_id,
        job_id=job["id"],
        amendment_text=amendment_text,
        user_id=user.user_id,
    )

    if settings.is_lambda:
        sqs_service.send_simulation_task(
            job_id=job["id"],
            doc_id=doc_id,
            sim_id=sim["id"],
            amendment_text=amendment_text,
            user_id=user.user_id,
        )
        return {"jobId": job["id"], "simId": sim["id"], "status": "QUEUED"}
    else:
        return _execute_simulation_inline(job, doc_id, sim["id"], amendment_text, user.user_id)


def _execute_simulation_inline(job: dict, doc_id: str, sim_id: str, amendment_text: str, user_id: str) -> dict:
    """Execute simulation inline for local dev."""
    try:
        from worker.tasks.amendment_simulation import process_amendment_simulation
        process_amendment_simulation({
            "job_id": job["id"],
            "doc_id": doc_id,
            "sim_id": sim_id,
            "amendment_text": amendment_text,
            "user_id": user_id,
        })
        return {"jobId": job["id"], "simId": sim_id, "status": "COMPLETE", "inline": True}
    except Exception as exc:
        logger.error("Inline simulation failed: %s", exc)
        dynamo_service.update_job(job["id"], {
            "status": "FAILED",
            "error": str(exc),
        })
        return {"jobId": job["id"], "simId": sim_id, "status": "FAILED", "error": str(exc), "inline": True}


def get_simulations(user: CurrentUser, doc_id: str) -> list[dict]:
    """Get all simulations for a document."""
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)
    sims = dynamo_service.get_simulations_for_document(doc_id)
    return [
        {
            "id": s.get("id"),
            "amendment_text": s.get("amendment_text", ""),
            "status": s.get("status", "QUEUED"),
            "result": s.get("result"),
            "created_at": s.get("created_at", ""),
        }
        for s in sims
    ]


# ════════════════════════════════════════════════════════════════
# REQ-6: PROTOCOL COMPARISON
# ════════════════════════════════════════════════════════════════
def trigger_comparison(user: CurrentUser, document_ids: list[str]) -> dict:
    """Trigger a comparison between multiple protocols."""
    from app.core.config import get_settings
    settings = get_settings()

    # Verify all documents exist
    for did in document_ids:
        doc = dynamo_service.get_document(did)
        if not doc:
            raise DocumentNotFoundError(did)

    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="COMPARE_PROTOCOLS",
        params={"document_ids": document_ids},
    )
    cmp = dynamo_service.create_comparison(
        user_id=user.user_id,
        document_ids=document_ids,
        job_id=job["id"],
    )

    if settings.is_lambda:
        sqs_service.send_comparison_task(
            job_id=job["id"],
            cmp_id=cmp["id"],
            document_ids=document_ids,
            user_id=user.user_id,
        )
        return {"jobId": job["id"], "cmpId": cmp["id"], "status": "QUEUED"}
    else:
        return _execute_comparison_inline(job, cmp["id"], document_ids, user.user_id)


def _execute_comparison_inline(job: dict, cmp_id: str, document_ids: list[str], user_id: str) -> dict:
    """Execute comparison inline for local dev."""
    try:
        from worker.tasks.protocol_comparison import process_protocol_comparison
        process_protocol_comparison({
            "job_id": job["id"],
            "cmp_id": cmp_id,
            "document_ids": document_ids,
            "user_id": user_id,
        })
        return {"jobId": job["id"], "cmpId": cmp_id, "status": "COMPLETE", "inline": True}
    except Exception as exc:
        logger.error("Inline comparison failed: %s", exc)
        dynamo_service.update_job(job["id"], {
            "status": "FAILED",
            "error": str(exc),
        })
        return {"jobId": job["id"], "cmpId": cmp_id, "status": "FAILED", "error": str(exc), "inline": True}


def get_comparisons(user: CurrentUser) -> list[dict]:
    """List all comparisons for the current user."""
    return dynamo_service.list_comparisons(user.user_id)


def get_comparison_result(user: CurrentUser, cmp_id: str) -> dict:
    """Get a single comparison result."""
    cmp = dynamo_service.get_comparison(cmp_id)
    if not cmp:
        raise JobNotFoundError(cmp_id)
    if cmp.get("user_id") and cmp["user_id"] != user.user_id:
        raise JobNotFoundError(cmp_id)
    return cmp


# ════════════════════════════════════════════════════════════════
# REQ-4: REGULATORY RISK TIMELINE
# ════════════════════════════════════════════════════════════════
def get_timeline(user: CurrentUser, doc_id: str) -> list[dict]:
    """
    Build a timeline of all regulatory events for a document.
    Aggregates: uploads, analyses, simulations, chat milestones.
    """
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    events = []

    # Document upload event
    events.append({
        "type": "upload",
        "title": "Protocol Uploaded",
        "description": f"Document '{doc.get('name', '')}' uploaded",
        "timestamp": doc.get("created_at", ""),
        "icon": "upload",
    })

    # Analysis events
    analysis = dynamo_service.get_analysis_for_document(doc_id)
    if analysis:
        events.append({
            "type": "analysis",
            "title": "Regulatory Analysis Complete",
            "description": f"Regulator: {analysis.get('regulator_score', 0)}%, Payer: {analysis.get('payer_score', 0)}%",
            "timestamp": analysis.get("completed_at", analysis.get("created_at", "")),
            "icon": "analysis",
            "data": {
                "regulator_score": analysis.get("regulator_score", 0),
                "payer_score": analysis.get("payer_score", 0),
                "findings_count": len(analysis.get("findings", [])),
            },
        })

    # Simulation events
    sims = dynamo_service.get_simulations_for_document(doc_id)
    for sim in sims:
        result = sim.get("result") or {}
        events.append({
            "type": "simulation",
            "title": "Amendment Simulated",
            "description": sim.get("amendment_text", "")[:100],
            "timestamp": sim.get("created_at", ""),
            "icon": "simulation",
            "data": {
                "status": sim.get("status"),
                "net_risk_change": result.get("net_risk_change", ""),
            },
        })

    # Sort by timestamp
    events.sort(key=lambda e: e.get("timestamp", ""))
    return events


# ════════════════════════════════════════════════════════════════
# REQ-8: SUBMISSION READINESS REPORT
# ════════════════════════════════════════════════════════════════
def generate_report(user: CurrentUser, doc_id: str, sections: list[str] | None = None) -> dict:
    """
    Generate a comprehensive submission readiness report.
    Aggregates all analysis data into a structured report.
    """
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    analysis = dynamo_service.get_analysis_for_document(doc_id)
    if not analysis:
        raise AnalysisNotFoundError(doc_id)

    sims = dynamo_service.get_simulations_for_document(doc_id)
    timeline = get_timeline(user, doc_id)

    # Build report structure
    report = {
        "document": {
            "id": doc_id,
            "name": doc.get("name", ""),
            "uploaded_at": doc.get("created_at", ""),
        },
        "executive_summary": {
            "regulator_score": analysis.get("regulator_score", 0),
            "payer_score": analysis.get("payer_score", 0),
            "global_readiness_score": analysis.get("global_readiness_score", 0),
            "summary": analysis.get("summary", ""),
            "total_findings": len(analysis.get("findings", [])),
            "critical_findings": sum(1 for f in analysis.get("findings", []) if f.get("severity") == "critical"),
            "high_findings": sum(1 for f in analysis.get("findings", []) if f.get("severity") == "high"),
        },
        "findings": analysis.get("findings", []),
        "jurisdiction_compass": {
            "scores": analysis.get("jurisdiction_scores", []),
            "global_readiness": analysis.get("global_readiness_score", 0),
        },
        "payer_analysis": {
            "gaps": analysis.get("payer_gaps", []),
            "hta_body_scores": analysis.get("hta_body_scores", {}),
        },
        "amendment_simulations": [
            {
                "amendment": s.get("amendment_text", ""),
                "status": s.get("status"),
                "result": s.get("result"),
            }
            for s in sims if s.get("status") == "COMPLETE"
        ],
        "timeline": timeline,
        "generated_at": dynamo_service._now_iso(),
    }

    return report


# ════════════════════════════════════════════════════════════════
# REQ-10: BENCHMARKING
# ════════════════════════════════════════════════════════════════
def get_benchmark(user: CurrentUser, doc_id: str, indication: str = "", phase: str = "") -> dict:
    """
    Benchmark a protocol against ClinicalTrials.gov data.
    Uses Bedrock to analyze the protocol against similar trial data.
    """
    from app.services import s3_service
    from app.services.regulatory_engine import generate_benchmark_analysis

    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise DocumentNotFoundError(doc_id)

    # Get document text for analysis
    s3_key = doc.get("s3_key", "")
    document_text = s3_service.extract_text_from_s3_object(s3_key) if s3_key else ""

    # Get existing analysis
    analysis = dynamo_service.get_analysis_for_document(doc_id)

    # Query ClinicalTrials.gov API for similar trials
    similar_trials = _query_clinical_trials(indication, phase)

    # Generate benchmark via Bedrock
    result = generate_benchmark_analysis(
        document_text=document_text,
        similar_trials=similar_trials,
        analysis=analysis,
    )

    return result


def _query_clinical_trials(indication: str = "", phase: str = "") -> list[dict]:
    """
    Query ClinicalTrials.gov v2 API for similar trials.
    Returns a simplified list of trial metadata.
    """
    import urllib.request
    import urllib.parse
    import json as json_mod

    params = []
    if indication:
        params.append(f"query.cond={urllib.parse.quote(indication)}")
    if phase:
        phase_map = {"1": "PHASE1", "2": "PHASE2", "3": "PHASE3", "4": "PHASE4"}
        ct_phase = phase_map.get(phase, phase)
        params.append(f"filter.advanced=AREA[Phase]{ct_phase}")
    params.append("pageSize=20")
    params.append("format=json")

    url = f"https://clinicaltrials.gov/api/v2/studies?{'&'.join(params)}"

    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json_mod.loads(resp.read().decode())

        trials = []
        for study in data.get("studies", [])[:20]:
            protocol = study.get("protocolSection", {})
            id_module = protocol.get("identificationModule", {})
            design = protocol.get("designModule", {})
            status_module = protocol.get("statusModule", {})
            eligibility = protocol.get("eligibilityModule", {})

            trials.append({
                "nct_id": id_module.get("nctId", ""),
                "title": id_module.get("briefTitle", ""),
                "phase": ", ".join(design.get("phases", [])),
                "enrollment": design.get("enrollmentInfo", {}).get("count"),
                "study_type": design.get("studyType", ""),
                "status": status_module.get("overallStatus", ""),
                "start_date": status_module.get("startDateStruct", {}).get("date", ""),
                "primary_completion": status_module.get("primaryCompletionDateStruct", {}).get("date", ""),
                "min_age": eligibility.get("minimumAge", ""),
                "max_age": eligibility.get("maximumAge", ""),
            })

        logger.info("ClinicalTrials.gov returned %d trials for indication=%s, phase=%s", len(trials), indication, phase)
        return trials
    except Exception as exc:
        logger.warning("ClinicalTrials.gov query failed: %s", exc)
        return []
