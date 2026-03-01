"""
NIX AI — Exception Handlers

Centralised error handling so routes stay clean.
"""

from __future__ import annotations

import logging
import traceback
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


# ── Custom Exceptions ───────────────────────────────────────────
class NixAIException(Exception):
    """Base exception for all NIX AI errors."""

    def __init__(self, message: str, status_code: int = 500, detail: Any = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(message)


class DocumentNotFoundError(NixAIException):
    def __init__(self, doc_id: str):
        super().__init__(f"Document {doc_id} not found", status_code=404)


class JobNotFoundError(NixAIException):
    def __init__(self, job_id: str):
        super().__init__(f"Job {job_id} not found", status_code=404)


class AnalysisNotFoundError(NixAIException):
    def __init__(self, analysis_id: str):
        super().__init__(f"Analysis {analysis_id} not found", status_code=404)


class MessageNotFoundError(NixAIException):
    def __init__(self, message_id: str):
        super().__init__(f"Message {message_id} not found", status_code=404)


class BedrockError(NixAIException):
    def __init__(self, detail: str):
        super().__init__(f"Bedrock AI service error: {detail}", status_code=502)


class StorageError(NixAIException):
    def __init__(self, detail: str):
        super().__init__(f"Storage error: {detail}", status_code=500)


class QueueError(NixAIException):
    def __init__(self, detail: str):
        super().__init__(f"Queue error: {detail}", status_code=500)


# ── Register handlers on the FastAPI app ────────────────────────
def register_exception_handlers(app: FastAPI) -> None:
    """Attach global exception handlers to the FastAPI application."""

    @app.exception_handler(NixAIException)
    async def nixai_exception_handler(request: Request, exc: NixAIException):
        logger.error("NixAIException: %s (status=%d)", exc.message, exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "detail": exc.detail,
                "status_code": exc.status_code,
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.error(
            "Unhandled exception: %s\n%s", str(exc), traceback.format_exc()
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": str(exc) if logger.isEnabledFor(logging.DEBUG) else None,
                "status_code": 500,
            },
        )
