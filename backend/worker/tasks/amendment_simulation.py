"""
Worker Task — Amendment Impact Simulation (REQ-3)

Takes a proposed amendment text and the original analysis, then uses
Bedrock to project how the amendment would change regulatory/payer scores.
"""

from __future__ import annotations

import logging
import time

from app.services import dynamo_service, s3_service
from app.services.regulatory_engine import simulate_amendment

logger = logging.getLogger(__name__)


def process_amendment_simulation(payload: dict) -> None:
    """
    Process an amendment simulation task.

    Payload:
        job_id:          str
        doc_id:          str
        sim_id:          str
        amendment_text:  str
        user_id:         str
    """
    job_id = payload["job_id"]
    doc_id = payload["doc_id"]
    sim_id = payload["sim_id"]
    amendment_text = payload["amendment_text"]
    user_id = payload.get("user_id", "system")

    start_time = time.time()

    dynamo_service.update_job(job_id, {
        "status": "IN_PROGRESS",
        "progress": 10,
        "current_step": "Loading document and analysis...",
    })

    try:
        # 1. Load document text from S3
        doc = dynamo_service.get_document(doc_id)
        if not doc:
            raise ValueError(f"Document not found: {doc_id}")

        s3_key = doc.get("s3_key", "")
        document_text = s3_service.extract_text_from_s3_object(s3_key) if s3_key else ""

        # 2. Load existing analysis
        analysis = dynamo_service.get_analysis_for_document(doc_id)
        if not analysis:
            raise ValueError(f"No analysis found for document: {doc_id}")

        original_analysis = {
            "regulator_score": analysis.get("regulator_score", 0),
            "payer_score": analysis.get("payer_score", 0),
            "findings": analysis.get("findings", []),
        }

        dynamo_service.update_job(job_id, {
            "progress": 40,
            "current_step": "Simulating amendment impact...",
        })

        # 3. Run simulation via regulatory engine
        result = simulate_amendment(
            document_text=document_text,
            original_analysis=original_analysis,
            amendment_description=amendment_text,
        )

        dynamo_service.update_job(job_id, {
            "progress": 80,
            "current_step": "Saving simulation results...",
        })

        # 4. Store result on simulation record
        dynamo_service.update_simulation(doc_id, sim_id, {
            "status": "COMPLETE",
            "result": result,
        })

        # 5. Mark job complete
        duration_s = round(time.time() - start_time, 2)
        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {
                "sim_id": sim_id,
                "net_risk_change": result.get("net_risk_change", "neutral"),
                "duration": str(duration_s),
            },
        })

        logger.info(
            "Amendment simulation complete: job=%s, sim=%s, duration=%.1fs",
            job_id, sim_id, duration_s,
        )

    except Exception as exc:
        logger.error("Amendment simulation failed for job %s: %s", job_id, exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        dynamo_service.update_simulation(doc_id, sim_id, {
            "status": "FAILED",
        })
        raise
