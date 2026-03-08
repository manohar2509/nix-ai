"""
NIX AI — Worker Lambda Handler

Triggered by SQS. Routes each message to the correct task processor.
Supports:
  • ANALYZE_DOCUMENT    → document_analysis.py
  • SYNC_KB             → kb_sync.py
  • GENERATE_SYNTHETIC  → (deprecated stub, marks job as complete)
  • SIMULATE_AMENDMENT  → amendment_simulation.py
  • COMPARE_PROTOCOLS   → protocol_comparison.py
  • RUN_BOARDROOM_DEBATE → boardroom_debate.py

Resilience features:
  • Structured error handling per task
  • Partial batch failure reporting (SQS)
  • Job status updates on failure
  • Retry-safe idempotent design
"""

from __future__ import annotations

import json
import logging
import sys
import time
import traceback

from worker.tasks.document_analysis import process_document_analysis
from worker.tasks.kb_sync import process_kb_sync
from worker.tasks.synthetic_generation import process_synthetic_generation  # deprecated stub
from worker.tasks.amendment_simulation import process_amendment_simulation
from worker.tasks.protocol_comparison import process_protocol_comparison
from worker.tasks.boardroom_debate import process_boardroom_debate

# Setup logging before anything else
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("nixai.worker")

# Task router
TASK_HANDLERS = {
    "ANALYZE_DOCUMENT": process_document_analysis,
    "SYNC_KB": process_kb_sync,
    "GENERATE_SYNTHETIC": process_synthetic_generation,  # backward compat
    "SIMULATE_AMENDMENT": process_amendment_simulation,
    "COMPARE_PROTOCOLS": process_protocol_comparison,
    "RUN_BOARDROOM_DEBATE": process_boardroom_debate,
}


def _update_job_status_on_failure(body: dict, error_msg: str) -> None:
    """Best-effort update of job status to FAILED when a task crashes."""
    job_id = body.get("job_id")
    if not job_id:
        return
    try:
        from app.services import dynamo_service
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": error_msg[:500],
        })
        logger.info("Marked job %s as FAILED", job_id)
    except Exception as update_exc:
        logger.warning("Could not update job %s status: %s", job_id, update_exc)


def lambda_handler(event, context):
    """
    SQS trigger entry-point.

    Each SQS record contains a JSON body with a `task` field that routes
    to the appropriate processor.

    Resilience:
    - Each record processed independently (partial batch failures)
    - Job status updated to FAILED on unhandled errors
    - Detailed error logging with timing
    """
    records = event.get("Records", [])
    logger.info("Worker invoked with %d record(s)", len(records))

    results = {"processed": 0, "failed": 0, "errors": []}
    batch_item_failures = []  # For SQS partial batch failure reporting

    for record in records:
        message_id = record.get("messageId", "unknown")
        start_time = time.time()
        body = {}

        try:
            body = json.loads(record["body"])
            task = body.get("task", "UNKNOWN")
            logger.info("Processing task=%s  messageId=%s  job_id=%s",
                       task, message_id, body.get("job_id", "?"))

            handler_fn = TASK_HANDLERS.get(task)
            if not handler_fn:
                error_msg = f"Unknown task type: {task}"
                logger.error(error_msg)
                _update_job_status_on_failure(body, error_msg)
                results["failed"] += 1
                results["errors"].append(error_msg)
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            handler_fn(body)
            duration_ms = (time.time() - start_time) * 1000
            results["processed"] += 1
            logger.info("Task %s completed successfully in %.0fms (job_id=%s)",
                       task, duration_ms, body.get("job_id", "?"))

        except json.JSONDecodeError as exc:
            error_msg = f"Malformed SQS message body: {str(exc)[:200]}"
            logger.error("Task failed for messageId=%s: %s", message_id, error_msg)
            results["failed"] += 1
            results["errors"].append(error_msg)
            batch_item_failures.append({"itemIdentifier": message_id})

        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = str(exc)[:500]
            logger.error(
                "Task failed for messageId=%s (%.0fms): %s\n%s",
                message_id, duration_ms, error_msg, traceback.format_exc(),
            )

            # Update job status to FAILED for tracking
            _update_job_status_on_failure(body, error_msg)

            results["failed"] += 1
            results["errors"].append(error_msg)
            batch_item_failures.append({"itemIdentifier": message_id})

    logger.info(
        "Worker finished: %d processed, %d failed",
        results["processed"],
        results["failed"],
    )
    # Return partial batch failure response so only failed messages
    # are retried by SQS (instead of the entire batch).
    return {"batchItemFailures": batch_item_failures}
