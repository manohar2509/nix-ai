"""
NIX AI — Worker Lambda Handler

Triggered by SQS. Routes each message to the correct task processor.
Supports:
  • ANALYZE_DOCUMENT    → document_analysis.py
  • SYNC_KB             → kb_sync.py
  • GENERATE_SYNTHETIC  → (deprecated stub, marks job as complete)
"""

from __future__ import annotations

import json
import logging
import sys
import traceback

# Setup logging before anything else
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("nixai.worker")

# Task processors
from worker.tasks.document_analysis import process_document_analysis
from worker.tasks.kb_sync import process_kb_sync
from worker.tasks.synthetic_generation import process_synthetic_generation  # deprecated stub

# Task router
TASK_HANDLERS = {
    "ANALYZE_DOCUMENT": process_document_analysis,
    "SYNC_KB": process_kb_sync,
    "GENERATE_SYNTHETIC": process_synthetic_generation,  # backward compat
}


def lambda_handler(event, context):
    """
    SQS trigger entry-point.

    Each SQS record contains a JSON body with a `task` field that routes
    to the appropriate processor.
    """
    records = event.get("Records", [])
    logger.info("Worker invoked with %d record(s)", len(records))

    results = {"processed": 0, "failed": 0, "errors": []}
    batch_item_failures = []  # For SQS partial batch failure reporting

    for record in records:
        message_id = record.get("messageId", "unknown")
        try:
            body = json.loads(record["body"])
            task = body.get("task", "UNKNOWN")
            logger.info("Processing task=%s  messageId=%s", task, message_id)

            handler_fn = TASK_HANDLERS.get(task)
            if not handler_fn:
                logger.error("Unknown task type: %s", task)
                results["failed"] += 1
                results["errors"].append(f"Unknown task: {task}")
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            handler_fn(body)
            results["processed"] += 1
            logger.info("Task %s completed successfully", task)

        except Exception as exc:
            logger.error(
                "Task failed for messageId=%s: %s\n%s",
                message_id,
                str(exc),
                traceback.format_exc(),
            )
            results["failed"] += 1
            results["errors"].append(str(exc))
            batch_item_failures.append({"itemIdentifier": message_id})

    logger.info(
        "Worker finished: %d processed, %d failed",
        results["processed"],
        results["failed"],
    )
    # Return partial batch failure response so only failed messages
    # are retried by SQS (instead of the entire batch).
    return {"batchItemFailures": batch_item_failures}
