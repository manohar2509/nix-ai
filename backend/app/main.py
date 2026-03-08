"""
NIX AI — Main Application

Creates the FastAPI app, wires middleware, exception handlers, and routes.
Exports:
  • `app`     – the FastAPI instance (for uvicorn local dev)
  • `handler` – the Mangum wrapper (for AWS Lambda)
"""

from __future__ import annotations

import time
import uuid
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging

# ── Bootstrap logging first ─────────────────────────────────────
setup_logging()

logger = logging.getLogger(__name__)

# ── Settings ─────────────────────────────────────────────────────
settings = get_settings()

# ── Create FastAPI app ───────────────────────────────────────────
app = FastAPI(
    title="NIX AI API",
    description="Clinical Trial Intelligence Platform — Backend API",
    version="1.0.0",
    docs_url="/docs",    # Keep Swagger UI available (protected by Cognito at gateway)
    redoc_url="/redoc" if settings.is_dev else None,
)

# ── CORS Middleware ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id", "Retry-After"],
)


# ── Request ID + Timing Middleware ───────────────────────────────
@app.middleware("http")
async def request_tracing_middleware(request: Request, call_next):
    """
    Adds request ID tracing and timing to every request.
    - Generates unique request ID for correlation
    - Measures request latency
    - Logs request/response for observability
    """
    request_id = request.headers.get("X-Request-Id", uuid.uuid4().hex[:16])
    request.state.request_id = request_id

    start_time = time.time()

    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000

        response.headers["X-Request-Id"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms:.0f}ms"

        # Log slow requests (>5s) as warnings
        log_level = logging.WARNING if duration_ms > 5000 else logging.INFO
        logger.log(
            log_level,
            "[%s] %s %s → %d (%.0fms)",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        return response
    except Exception as exc:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(
            "[%s] %s %s → UNHANDLED ERROR (%.0fms): %s",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
            str(exc)[:200],
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "error_code": "INTERNAL_ERROR",
                "retryable": False,
                "request_id": request_id,
            },
            headers={"X-Request-Id": request_id},
        )


# ── Exception Handlers ──────────────────────────────────────────
register_exception_handlers(app)

# ── Routes ───────────────────────────────────────────────────────
app.include_router(api_router)

# ── Mangum Handler (Lambda entry-point) ──────────────────────────
handler = Mangum(app, lifespan="off")
