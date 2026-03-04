"""
NIX AI — Worker Task: Boardroom Debate

Processes RUN_BOARDROOM_DEBATE tasks from SQS.
This is triggered when a user clicks "Convene Council" in the UI.

Flow:
  1. Receive SQS message with debate_id, doc_id, user_id
  2. Validate the debate/job still needs processing
  3. Run the full boardroom debate (30-60 seconds)
  4. Update job status to COMPLETE
"""

from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone

from app.services import dynamo_service

logger = logging.getLogger(__name__)


def process_boardroom_debate(body: dict) -> None:
    """
    Process a RUN_BOARDROOM_DEBATE task from SQS.

    Args:
        body: {
            "task": "RUN_BOARDROOM_DEBATE",
            "job_id": "...",
            "debate_id": "...",
            "doc_id": "...",
            "user_id": "...",
            "max_rounds": 3  (optional)
        }
    """
    job_id = body.get("job_id", "")
    debate_id = body.get("debate_id", "")
    doc_id = body.get("doc_id", "")
    user_id = body.get("user_id", "")
    max_rounds = body.get("max_rounds", 3)

    logger.info(
        "Processing boardroom debate: job=%s debate=%s doc=%s",
        job_id, debate_id, doc_id,
    )

    # ── Guard: Check job is still actionable ──
    if job_id:
        job = dynamo_service.get_job(job_id)
        if job and job.get("status") in ("COMPLETE", "FAILED", "CANCELLED"):
            logger.info("Job %s already in terminal state: %s", job_id, job["status"])
            return

        # Mark job as IN_PROGRESS
        dynamo_service.update_job(job_id, {
            "status": "IN_PROGRESS",
            "progress": 5,
        })

    try:
        # Import here to avoid circular imports at module level
        from worker.boardroom.graph import run_boardroom_debate

        # Run the full debate
        result = run_boardroom_debate(
            debate_id=debate_id,
            doc_id=doc_id,
            user_id=user_id,
            max_rounds=max_rounds,
        )

        # Update job with results
        if job_id:
            dynamo_service.update_job(job_id, {
                "status": "COMPLETE",
                "progress": 100,
                "result": {
                    "debate_id": debate_id,
                    "rounds_completed": result.get("rounds_completed", 0),
                    "total_turns": result.get("total_turns", 0),
                },
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })

        logger.info("Boardroom debate %s completed successfully", debate_id)

    except Exception as exc:
        logger.error(
            "Boardroom debate %s failed: %s\n%s",
            debate_id, str(exc), traceback.format_exc(),
        )

        # Mark debate as failed
        try:
            dynamo_service.update_debate(debate_id, {
                "status": "FAILED",
                "error": str(exc)[:500],
            })
        except Exception:
            pass

        # Mark job as failed
        if job_id:
            dynamo_service.update_job(job_id, {
                "status": "FAILED",
                "error": str(exc)[:500],
            })

        raise  # Re-raise so SQS can retry
