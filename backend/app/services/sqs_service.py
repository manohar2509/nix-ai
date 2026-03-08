"""
NIX AI — SQS Service

Publishes messages to the job queue for the Worker Lambda.
"""

from __future__ import annotations

import json
import logging
import time
import random

from app.core.aws_clients import get_sqs_client
from app.core.config import get_settings
from app.core.exceptions import QueueError
from app.core.resilience import sqs_circuit, CircuitBreakerError

logger = logging.getLogger(__name__)

# SQS retry config (network transients, throttling)
_MAX_RETRIES = 3
_BASE_DELAY = 0.5  # seconds


def send_message(task: str, payload: dict) -> str:
    """
    Send a task message to the worker queue.

    Resilience: circuit breaker + retry with exponential backoff.

    Args:
        task:    Task type (e.g. GENERATE_SYNTHETIC, ANALYZE_DOCUMENT, SYNC_KB)
        payload: Task-specific parameters

    Returns:
        SQS MessageId
    """
    settings = get_settings()
    sqs = get_sqs_client()

    if not settings.SQS_URL:
        logger.warning("SQS_URL not configured — message not sent: %s", task)
        return "local-mock-message-id"

    message_body = {
        "task": task,
        **payload,
    }

    last_exc = None
    for attempt in range(_MAX_RETRIES):
        try:
            # Circuit breaker check
            sqs_circuit.before_call()

            send_params = {
                "QueueUrl": settings.SQS_URL,
                "MessageBody": json.dumps(message_body, default=str),
            }
            # MessageGroupId is only valid for FIFO queues
            if settings.SQS_URL.endswith(".fifo"):
                send_params["MessageGroupId"] = task

            response = sqs.send_message(**send_params)
            message_id = response["MessageId"]
            sqs_circuit.on_success()
            logger.info("SQS message sent: task=%s, messageId=%s", task, message_id)
            return message_id

        except CircuitBreakerError:
            logger.error("SQS circuit breaker OPEN — cannot send task=%s", task)
            raise QueueError(f"SQS service unavailable (circuit open) for task {task}")
        except Exception as exc:
            sqs_circuit.on_failure()
            last_exc = exc
            if attempt < _MAX_RETRIES - 1:
                delay = _BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.3)
                logger.warning(
                    "SQS send attempt %d/%d failed for task=%s: %s — retrying in %.1fs",
                    attempt + 1, _MAX_RETRIES, task, exc, delay,
                )
                time.sleep(delay)
            else:
                logger.error("SQS send failed after %d attempts: %s", _MAX_RETRIES, exc)

    raise QueueError(f"Failed to queue task {task} after {_MAX_RETRIES} attempts: {last_exc}")


def send_analysis_task(
    job_id: str, doc_id: str, s3_key: str, user_id: str,
    preferences: dict | None = None,
) -> str:
    """Convenience: queue a document analysis job."""
    payload = {
        "job_id": job_id,
        "doc_id": doc_id,
        "s3_key": s3_key,
        "user_id": user_id,
    }
    if preferences:
        payload["preferences"] = preferences
    return send_message("ANALYZE_DOCUMENT", payload)


def send_kb_sync_task(job_id: str, user_id: str, sync_params: dict | None = None) -> str:
    """Convenience: queue a Knowledge Base sync job."""
    payload = {
        "job_id": job_id,
        "user_id": user_id,
    }
    if sync_params:
        payload["sync_params"] = sync_params
    return send_message("SYNC_KB", payload)


def send_simulation_task(
    job_id: str, doc_id: str, sim_id: str, amendment_text: str, user_id: str,
) -> str:
    """Convenience: queue an amendment impact simulation job."""
    return send_message("SIMULATE_AMENDMENT", {
        "job_id": job_id,
        "doc_id": doc_id,
        "sim_id": sim_id,
        "amendment_text": amendment_text,
        "user_id": user_id,
    })


def send_comparison_task(
    job_id: str, cmp_id: str, document_ids: list[str], user_id: str,
) -> str:
    """Convenience: queue a protocol comparison job."""
    return send_message("COMPARE_PROTOCOLS", {
        "job_id": job_id,
        "cmp_id": cmp_id,
        "document_ids": document_ids,
        "user_id": user_id,
    })


def send_boardroom_debate_task(
    job_id: str,
    debate_id: str,
    doc_id: str,
    user_id: str,
    max_rounds: int = 3,
) -> str:
    """Convenience: queue a boardroom debate (Adversarial Council v2)."""
    return send_message("RUN_BOARDROOM_DEBATE", {
        "job_id": job_id,
        "debate_id": debate_id,
        "doc_id": doc_id,
        "user_id": user_id,
        "max_rounds": max_rounds,
    })
