"""
NIX AI — Structured Logging

Outputs JSON logs for CloudWatch Logs Insights compatibility.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from typing import Any

from app.core.config import get_settings


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON for CloudWatch."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        return json.dumps(log_entry, default=str)


def setup_logging() -> None:
    """Configure root logger with JSON formatter for Lambda / structured output."""
    settings = get_settings()
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Remove existing handlers (Lambda adds its own)
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    if settings.is_lambda or not settings.is_dev:
        handler.setFormatter(JSONFormatter())
    else:
        # Pretty format for local development
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s │ %(levelname)-8s │ %(name)-25s │ %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    root.addHandler(handler)

    # Silence noisy libraries
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def generate_request_id() -> str:
    """Short unique ID for request tracing."""
    return f"req-{uuid.uuid4().hex[:12]}"
