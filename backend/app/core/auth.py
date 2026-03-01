"""
NIX AI — Authentication Dependency

Extracts the current user from the request.  Two modes:
  • Lambda (production):  Cognito claims are passed by API Gateway through
    the Lambda event → Mangum puts them in request.scope["aws.event"].
  • Local dev (uvicorn):  Reads the Authorization header, decodes the JWT
    with python-jose, or falls back to a mock user when DEBUG=True.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────
# User Model (lightweight dataclass — not stored, just request-scoped)
# ────────────────────────────────────────────────────────────────
@dataclass
class CurrentUser:
    user_id: str
    email: str
    name: str
    organization: str = "Independent"
    job_title: str = ""
    groups: list[str] = field(default_factory=list)

    @property
    def is_admin(self) -> bool:
        return "Admin" in self.groups

    @property
    def role(self) -> str:
        return "ADMIN" if self.is_admin else "CLINICAL"


# ────────────────────────────────────────────────────────────────
# Mock user for local development
# ────────────────────────────────────────────────────────────────
MOCK_USER = CurrentUser(
    user_id="dev-user-001",
    email="developer@nixai.com",
    name="Dev User",
    organization="NIX AI Dev",
    job_title="Developer",
    groups=["Admin", "Clinical"],
)


# ────────────────────────────────────────────────────────────────
# FastAPI Dependency
# ────────────────────────────────────────────────────────────────
async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    """
    Extract the authenticated user from the request.

    Priority:
      1. Lambda event context (Cognito Authorizer claims)
      2. Authorization Bearer token (JWT decode for local dev)
      3. Mock user (only when DEBUG=True)
    """

    # ── 1. Try Lambda event context (production path) ──────────
    aws_event = request.scope.get("aws.event")
    if aws_event:
        try:
            claims = (
                aws_event.get("requestContext", {})
                .get("authorizer", {})
                .get("claims", {})
            )
            if not claims:
                # HTTP API v2 uses jwt authorizer structure
                claims = (
                    aws_event.get("requestContext", {})
                    .get("authorizer", {})
                    .get("jwt", {})
                    .get("claims", {})
                )

            if claims:
                return CurrentUser(
                    user_id=claims.get("sub", "unknown"),
                    email=claims.get("email", ""),
                    name=claims.get("name", "User"),
                    organization=claims.get("custom:organization", "Independent"),
                    job_title=claims.get("custom:job_title", ""),
                    groups=_parse_groups(claims.get("cognito:groups", "[]")),
                )
        except Exception as exc:
            logger.warning("Failed to extract Cognito claims: %s", exc)

    # ── 2. Try Authorization header (local dev with real token) ─
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        # Skip mock tokens
        if not token.startswith("mock-jwt-"):
            try:
                user = _decode_cognito_token(token, settings)
                if user:
                    return user
            except Exception as exc:
                logger.warning("JWT decode failed: %s", exc)

    # ── 3. Development fallback ─────────────────────────────────
    if settings.is_dev or settings.DEBUG:
        logger.debug("Using mock user for development")
        return MOCK_USER

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _parse_groups(raw: str) -> list[str]:
    """Parse Cognito groups from claims (can be JSON array or comma-separated)."""
    if isinstance(raw, list):
        return raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else [str(parsed)]
    except (json.JSONDecodeError, TypeError):
        return [g.strip() for g in str(raw).split(",") if g.strip()]


def _decode_cognito_token(token: str, settings: Settings) -> Optional[CurrentUser]:
    """
    Decode a Cognito JWT for local development.
    In production, API Gateway handles validation — this is a convenience.
    """
    try:
        from jose import jwt as jose_jwt

        # Decode without verification for local dev (API GW verifies in prod)
        unverified = jose_jwt.get_unverified_claims(token)
        return CurrentUser(
            user_id=unverified.get("sub", "unknown"),
            email=unverified.get("email", ""),
            name=unverified.get("name", "User"),
            organization=unverified.get("custom:organization", "Independent"),
            job_title=unverified.get("custom:job_title", ""),
            groups=_parse_groups(unverified.get("cognito:groups", "[]")),
        )
    except ImportError:
        logger.warning("python-jose not installed; cannot decode JWT locally")
        return None
    except Exception as exc:
        logger.warning("Token decode failed: %s", exc)
        return None


# ── Admin-only dependency ──────────────────────────────────────
async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Raises 403 if the authenticated user is not an Admin."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
