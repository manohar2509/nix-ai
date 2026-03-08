"""
NIX AI — Exception Handlers

Centralised error handling so routes stay clean.
Features:
  - Custom typed exceptions with HTTP status codes
  - Global exception handlers with request ID tracing
  - Structured error responses for frontend consumption
  - Circuit breaker error handling
  - Graceful degradation for AI service failures
"""

from __future__ import annotations

import logging
import traceback
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


# ── Custom Exceptions ───────────────────────────────────────────
class NixAIException(Exception):
    """Base exception for all NIX AI errors."""

    def __init__(self, message: str, status_code: int = 500, detail: Any = None,
                 error_code: str = "INTERNAL_ERROR", retryable: bool = False):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        self.retryable = retryable
        super().__init__(message)


class DocumentNotFoundError(NixAIException):
    def __init__(self, doc_id: str):
        super().__init__(
            f"Document {doc_id} not found",
            status_code=404,
            error_code="DOCUMENT_NOT_FOUND",
        )


class JobNotFoundError(NixAIException):
    def __init__(self, job_id: str):
        super().__init__(
            f"Job {job_id} not found",
            status_code=404,
            error_code="JOB_NOT_FOUND",
        )


class AnalysisNotFoundError(NixAIException):
    def __init__(self, analysis_id: str):
        super().__init__(
            f"Analysis {analysis_id} not found",
            status_code=404,
            error_code="ANALYSIS_NOT_FOUND",
        )


class MessageNotFoundError(NixAIException):
    def __init__(self, message_id: str):
        super().__init__(
            f"Message {message_id} not found",
            status_code=404,
            error_code="MESSAGE_NOT_FOUND",
        )


class BedrockError(NixAIException):
    def __init__(self, detail: str, retryable: bool = True):
        super().__init__(
            f"Bedrock AI service error: {detail}",
            status_code=502,
            error_code="AI_SERVICE_ERROR",
            retryable=retryable,
        )


class StorageError(NixAIException):
    def __init__(self, detail: str):
        super().__init__(
            f"Storage error: {detail}",
            status_code=500,
            error_code="STORAGE_ERROR",
            retryable=True,
        )


class QueueError(NixAIException):
    def __init__(self, detail: str):
        super().__init__(
            f"Queue error: {detail}",
            status_code=500,
            error_code="QUEUE_ERROR",
            retryable=True,
        )


class RateLimitError(NixAIException):
    """Raised when the system is under heavy load."""
    def __init__(self, detail: str = "Too many requests. Please try again in a few seconds."):
        super().__init__(
            detail,
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            retryable=True,
        )


class CircuitOpenError(NixAIException):
    """Raised when a service circuit breaker is open."""
    def __init__(self, service: str, retry_after: float = 60.0):
        super().__init__(
            f"Service '{service}' is temporarily unavailable. Automatic recovery in {retry_after:.0f}s.",
            status_code=503,
            error_code="SERVICE_UNAVAILABLE",
            retryable=True,
            detail={"service": service, "retry_after_seconds": retry_after},
        )


class ValidationError(NixAIException):
    """Raised for input validation errors."""
    def __init__(self, detail: str):
        super().__init__(
            f"Validation error: {detail}",
            status_code=422,
            error_code="VALIDATION_ERROR",
            retryable=False,
        )


# ── Register handlers on the FastAPI app ────────────────────────
def register_exception_handlers(app: FastAPI) -> None:
    """Attach global exception handlers to the FastAPI application."""

    @app.exception_handler(NixAIException)
    async def nixai_exception_handler(request: Request, exc: NixAIException):
        request_id = getattr(request.state, "request_id", "unknown")
        logger.error(
            "NixAIException [%s]: %s (status=%d, code=%s, retryable=%s)",
            request_id, exc.message, exc.status_code, exc.error_code, exc.retryable,
        )
        response_body = {
            "error": exc.message,
            "error_code": exc.error_code,
            "detail": exc.detail,
            "status_code": exc.status_code,
            "retryable": exc.retryable,
            "request_id": request_id,
        }
        return JSONResponse(
            status_code=exc.status_code,
            content=response_body,
            headers={"X-Request-Id": request_id},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", "unknown")
        logger.error(
            "Unhandled exception [%s]: %s\n%s",
            request_id, str(exc), traceback.format_exc(),
        )

        # Detect specific boto3 errors for better error messages
        error_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
        if error_code in ("ThrottlingException", "TooManyRequestsException"):
            return JSONResponse(
                status_code=429,
                content={
                    "error": "AI service is experiencing high demand. Please try again in a few seconds.",
                    "error_code": "THROTTLED",
                    "retryable": True,
                    "request_id": request_id,
                },
                headers={
                    "X-Request-Id": request_id,
                    "Retry-After": "5",
                },
            )

        if error_code in ("ServiceUnavailableException", "InternalServerException"):
            return JSONResponse(
                status_code=503,
                content={
                    "error": "AI service is temporarily unavailable. Please try again shortly.",
                    "error_code": "SERVICE_UNAVAILABLE",
                    "retryable": True,
                    "request_id": request_id,
                },
                headers={
                    "X-Request-Id": request_id,
                    "Retry-After": "10",
                },
            )

        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "error_code": "INTERNAL_ERROR",
                "detail": str(exc)[:200] if logger.isEnabledFor(logging.DEBUG) else None,
                "status_code": 500,
                "retryable": False,
                "request_id": request_id,
            },
            headers={"X-Request-Id": request_id},
        )
