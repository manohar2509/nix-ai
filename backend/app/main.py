"""
NIX AI — Main Application

Creates the FastAPI app, wires middleware, exception handlers, and routes.
Exports:
  • `app`     – the FastAPI instance (for uvicorn local dev)
  • `handler` – the Mangum wrapper (for AWS Lambda)
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging

# ── Bootstrap logging first ─────────────────────────────────────
setup_logging()

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
    expose_headers=["X-Request-Id"],
)

# ── Exception Handlers ──────────────────────────────────────────
register_exception_handlers(app)

# ── Routes ───────────────────────────────────────────────────────
app.include_router(api_router)

# ── Mangum Handler (Lambda entry-point) ──────────────────────────
handler = Mangum(app, lifespan="off")
