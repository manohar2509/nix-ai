"""Health check route."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.schemas.common import HealthResponse
from app.core.config import Settings, get_settings

router = APIRouter(tags=["health"])


def _health_response(settings: Settings) -> HealthResponse:
    return HealthResponse(
        status="NIX AI System Online",
        version="1.0.0",
        environment=settings.ENV,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/", response_model=HealthResponse)
def health_check(settings: Settings = Depends(get_settings)):
    return _health_response(settings)


@router.get("/health", response_model=HealthResponse)
def health_check_alias(settings: Settings = Depends(get_settings)):
    """Health check at /health path — used by monitoring & smoke tests."""
    return _health_response(settings)
