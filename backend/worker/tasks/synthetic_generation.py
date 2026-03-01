"""
Worker Task — Synthetic Data Generation (DEPRECATED)

Synthetic / training data is generated EXTERNALLY (via LLMs or other
tools outside the platform) and uploaded through the normal document
upload flow.  The documents are then copied into the Knowledge Base
bucket and indexed via KB Sync.

This module is kept as a stub for backward compatibility with any
queued messages that may still reference GENERATE_SYNTHETIC.
"""

from __future__ import annotations

import logging

from app.services import dynamo_service

logger = logging.getLogger(__name__)


def process_synthetic_generation(payload: dict) -> None:
    """
    DEPRECATED — synthetic data is now uploaded externally.

    If a legacy GENERATE_SYNTHETIC message arrives, mark it complete
    immediately with an explanatory note.
    """
    job_id = payload.get("job_id")
    if not job_id:
        logger.warning("GENERATE_SYNTHETIC received without job_id — ignoring")
        return

    logger.info(
        "GENERATE_SYNTHETIC is deprecated. Marking job %s as COMPLETE with notice.",
        job_id,
    )
    dynamo_service.update_job(job_id, {
        "status": "COMPLETE",
        "progress": 100,
        "current_step": "Complete",
        "result": {
            "message": (
                "In-app synthetic generation has been removed. "
                "Please generate data externally and upload documents "
                "through the Knowledge Base panel."
            ),
        },
    })
