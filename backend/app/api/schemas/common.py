"""Shared response models used across multiple routes."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class StatusResponse(BaseModel):
    """Generic status response."""
    status: str
    message: str = ""


class ErrorResponse(BaseModel):
    """Standard error envelope."""
    error: str
    detail: Optional[str] = None
    status_code: int = 500


class PaginatedResponse(BaseModel):
    """Wrapper for paginated list endpoints."""
    items: list[Any] = []
    count: int = 0
    next_token: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "NIX AI System Online"
    version: str = "1.0.0"
    environment: str = "development"
    timestamp: str = ""
