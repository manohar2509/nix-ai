"""
NIX AI — Application Configuration

All settings are loaded from environment variables with sensible defaults
for local development. In Lambda, these are set via the SAM template.

For local dev, a .env file is loaded automatically via python-dotenv.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

# ── Load .env file FIRST so os.getenv picks up all values ─────
# This is a no-op in Lambda (no .env file present).
try:
    from dotenv import load_dotenv

    _env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path, override=True)
except ImportError:
    pass  # python-dotenv not installed (e.g. in Lambda layer)


class Settings:
    """Central configuration loaded once from environment."""

    # ── Environment ──────────────────────────────────────────────
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # ── AWS Credentials ──────────────────────────────────────────
    # For local dev: loaded from .env. In Lambda: provided by IAM role.
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")

    # ── S3 ───────────────────────────────────────────────────────
    BUCKET_NAME: str = os.getenv("BUCKET_NAME", "nixai-clinical-uploads")
    KB_BUCKET_NAME: str = os.getenv("KB_BUCKET_NAME", "nixai-clinical-kb")
    UPLOAD_PREFIX: str = os.getenv("UPLOAD_PREFIX", "uploads/")
    SYNTHETIC_PREFIX: str = os.getenv("SYNTHETIC_PREFIX", "synthetic/")
    PRESIGNED_URL_EXPIRY: int = int(os.getenv("PRESIGNED_URL_EXPIRY", "3600"))

    # ── SQS ──────────────────────────────────────────────────────
    SQS_URL: str = os.getenv("SQS_URL", "")

    # ── DynamoDB ─────────────────────────────────────────────────
    DYNAMODB_TABLE: str = os.getenv("DYNAMODB_TABLE", "nixai-core")

    # ── Cognito ──────────────────────────────────────────────────
    COGNITO_USER_POOL_ID: str = os.getenv("COGNITO_USER_POOL_ID", "")
    COGNITO_APP_CLIENT_ID: str = os.getenv("COGNITO_APP_CLIENT_ID", "")
    COGNITO_REGION: str = os.getenv("COGNITO_REGION", AWS_REGION)

    # ── Bedrock ──────────────────────────────────────────────────
    BEDROCK_MODEL_ID: str = os.getenv(
        "BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0"
    )
    BEDROCK_KB_ID: str = os.getenv("BEDROCK_KB_ID", "")

    # ── Boardroom (Adversarial Council v2) ─────────────────────
    BOARDROOM_MODEL_ID: str = os.getenv(
        "BOARDROOM_MODEL_ID", "us.amazon.nova-pro-v1:0"
    )

    # ── Textract (optional — for structured table/form extraction) ──
    TEXTRACT_ENABLED: bool = os.getenv("TEXTRACT_ENABLED", "false").lower() == "true"

    @property
    def bedrock_kb_model_arn(self) -> str:
        """Bedrock KB model ARN — region-aware default."""
        return os.getenv(
            "BEDROCK_KB_MODEL_ARN",
            f"arn:aws:bedrock:{self.AWS_REGION}::foundation-model/{self.BEDROCK_MODEL_ID}",
        )

    # ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")

    @property
    def is_lambda(self) -> bool:
        """Detect if running inside AWS Lambda."""
        return "AWS_LAMBDA_FUNCTION_NAME" in os.environ

    @property
    def is_dev(self) -> bool:
        return self.ENV == "development"

    @property
    def boto3_credentials(self) -> dict:
        """Return credential kwargs for boto3 client/resource constructors.

        In Lambda the IAM role provides credentials automatically, so this
        returns only region_name. For local dev it passes the explicit keys.
        """
        creds: dict = {"region_name": self.AWS_REGION}
        if self.AWS_ACCESS_KEY_ID and self.AWS_SECRET_ACCESS_KEY:
            creds["aws_access_key_id"] = self.AWS_ACCESS_KEY_ID
            creds["aws_secret_access_key"] = self.AWS_SECRET_ACCESS_KEY
        return creds


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton settings instance (cached)."""
    return Settings()
