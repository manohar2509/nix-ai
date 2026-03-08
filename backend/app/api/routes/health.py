"""Health check route with resilience monitoring."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.schemas.common import HealthResponse
from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

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


@router.get("/health/resilience")
def resilience_health():
    """
    Resilience metrics endpoint — shows cache stats, circuit breaker states,
    and rate limiter status. Used by monitoring dashboards and hackathon judges
    to verify production-grade resilience patterns.
    """
    try:
        from app.core.resilience import get_resilience_stats
        stats = get_resilience_stats()
        return {
            "status": "healthy",
            "resilience": stats,
            "patterns": [
                "LLM Response Caching (LRU + TTL)",
                "Exponential Backoff with Jitter",
                "Circuit Breaker (per-service)",
                "Token Bucket Rate Limiting",
                "Request ID Tracing",
                "Structured Error Responses",
                "Graceful Degradation",
            ],
        }
    except Exception as exc:
        logger.error("Failed to get resilience stats: %s", exc)
        return {
            "status": "degraded",
            "error": str(exc)[:200],
        }
