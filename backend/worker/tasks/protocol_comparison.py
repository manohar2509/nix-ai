"""
Worker Task — Protocol Comparison (REQ-6)

Compares multiple protocols across key regulatory dimensions.
"""

from __future__ import annotations

import logging
import time

from app.services import dynamo_service, s3_service
from app.services.regulatory_engine import compare_protocols

logger = logging.getLogger(__name__)


def process_protocol_comparison(payload: dict) -> None:
    """
    Process a protocol comparison task.

    Payload:
        job_id:        str
        cmp_id:        str
        document_ids:  list[str]
        user_id:       str
    """
    job_id = payload["job_id"]
    cmp_id = payload["cmp_id"]
    document_ids = payload["document_ids"]
    user_id = payload.get("user_id", "system")

    start_time = time.time()

    dynamo_service.update_job(job_id, {
        "status": "IN_PROGRESS",
        "progress": 10,
        "current_step": "Loading protocols...",
    })

    try:
        # 1. Load each document's text and analysis
        documents = []
        for doc_id in document_ids:
            doc = dynamo_service.get_document(doc_id)
            if not doc:
                logger.warning("Document %s not found, skipping", doc_id)
                continue

            s3_key = doc.get("s3_key", "")
            text = s3_service.extract_text_from_s3_object(s3_key) if s3_key else ""
            analysis = dynamo_service.get_analysis_for_document(doc_id)

            documents.append({
                "id": doc_id,
                "name": doc.get("name", doc_id),
                "text": text,
                "analysis": {
                    "regulator_score": analysis.get("regulator_score", 0) if analysis else 0,
                    "payer_score": analysis.get("payer_score", 0) if analysis else 0,
                } if analysis else {},
            })

        if len(documents) < 2:
            raise ValueError("Need at least 2 documents for comparison")

        dynamo_service.update_job(job_id, {
            "progress": 40,
            "current_step": "Comparing protocols...",
        })

        # 2. Run comparison via regulatory engine
        result = compare_protocols(documents)

        dynamo_service.update_job(job_id, {
            "progress": 80,
            "current_step": "Saving comparison results...",
        })

        # 3. Store result
        dynamo_service.update_comparison(cmp_id, {
            "status": "COMPLETE",
            "result": result,
        })

        # 4. Mark job complete
        duration_s = round(time.time() - start_time, 2)
        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {
                "cmp_id": cmp_id,
                "documents_compared": len(documents),
                "duration": str(duration_s),
            },
        })

        logger.info(
            "Protocol comparison complete: job=%s, cmp=%s, docs=%d, duration=%.1fs",
            job_id, cmp_id, len(documents), duration_s,
        )

    except Exception as exc:
        logger.error("Protocol comparison failed for job %s: %s", job_id, exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        dynamo_service.update_comparison(cmp_id, {
            "status": "FAILED",
        })
        raise
