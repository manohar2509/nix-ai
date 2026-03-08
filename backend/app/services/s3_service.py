"""
NIX AI — S3 Service

Handles presigned URL generation, file operations, and bucket management.
"""

from __future__ import annotations

import logging
import time
import random
from typing import Optional

from app.core.aws_clients import get_s3_client
from app.core.config import get_settings
from app.core.exceptions import StorageError
from app.core.resilience import s3_circuit, CircuitBreakerError

logger = logging.getLogger(__name__)

# S3 retry config
_MAX_RETRIES = 3
_BASE_DELAY = 0.3  # seconds


def _s3_retry(operation_name: str):
    """Decorator: circuit breaker + retry with backoff for S3 operations."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(_MAX_RETRIES):
                try:
                    s3_circuit.before_call()
                    result = func(*args, **kwargs)
                    s3_circuit.on_success()
                    return result
                except CircuitBreakerError:
                    logger.error("S3 circuit breaker OPEN — cannot perform %s", operation_name)
                    raise StorageError(f"S3 service unavailable (circuit open) for {operation_name}")
                except Exception as exc:
                    s3_circuit.on_failure()
                    last_exc = exc
                    error_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
                    # Don't retry client errors like NoSuchKey, AccessDenied
                    if error_code in ("NoSuchKey", "NoSuchBucket", "AccessDenied", "403", "404"):
                        raise
                    if attempt < _MAX_RETRIES - 1:
                        delay = _BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.2)
                        logger.warning(
                            "S3 %s attempt %d/%d failed: %s — retrying in %.1fs",
                            operation_name, attempt + 1, _MAX_RETRIES, exc, delay,
                        )
                        time.sleep(delay)
                    else:
                        logger.error("S3 %s failed after %d attempts: %s", operation_name, _MAX_RETRIES, exc)
            raise StorageError(f"S3 {operation_name} failed after {_MAX_RETRIES} retries: {last_exc}")
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    return decorator


@_s3_retry("generate_presigned_upload_url")
def generate_presigned_upload_url(
    filename: str, content_type: str = "application/pdf",
    user_id: str = "",
) -> dict:
    """Generate a presigned PUT URL for direct browser → S3 upload.

    S3 key is scoped to the user to prevent filename collisions.
    Resilience: circuit breaker + retry with exponential backoff.
    """
    import uuid as _uuid
    settings = get_settings()
    s3 = get_s3_client()
    # Add user prefix and a short UUID to prevent collisions
    unique_prefix = _uuid.uuid4().hex[:8]
    if user_id:
        key = f"{settings.UPLOAD_PREFIX}{user_id}/{unique_prefix}_{filename}"
    else:
        key = f"{settings.UPLOAD_PREFIX}{unique_prefix}_{filename}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.BUCKET_NAME,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=settings.PRESIGNED_URL_EXPIRY,
    )
    logger.info("Generated presigned URL for %s", key)
    return {
        "url": url,
        "key": key,
        "expiration": settings.PRESIGNED_URL_EXPIRY,
    }


@_s3_retry("generate_presigned_download_url")
def generate_presigned_download_url(key: str) -> str:
    """Generate a presigned GET URL for downloading from S3.

    Resilience: circuit breaker + retry with exponential backoff.
    """
    settings = get_settings()
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.BUCKET_NAME, "Key": key},
        ExpiresIn=settings.PRESIGNED_URL_EXPIRY,
    )


@_s3_retry("get_object_content")
def get_object_content(key: str) -> Optional[str]:
    """Read text content from an S3 object (UTF-8 text files only).

    Resilience: circuit breaker + retry with exponential backoff.
    """
    settings = get_settings()
    s3 = get_s3_client()
    try:
        response = s3.get_object(Bucket=settings.BUCKET_NAME, Key=key)
        return response["Body"].read().decode("utf-8")
    except s3.exceptions.NoSuchKey:
        return None
    except UnicodeDecodeError:
        logger.warning("S3 object %s is not UTF-8 text (likely binary/PDF)", key)
        return None


@_s3_retry("get_object_bytes")
def get_object_bytes(key: str) -> Optional[bytes]:
    """Read raw bytes from an S3 object. Works for any file type.

    Resilience: circuit breaker + retry with exponential backoff.
    """
    settings = get_settings()
    s3 = get_s3_client()
    try:
        response = s3.get_object(Bucket=settings.BUCKET_NAME, Key=key)
        return response["Body"].read()
    except s3.exceptions.NoSuchKey:
        return None


def get_object_metadata(key: str) -> Optional[dict]:
    """Get object metadata (content type, size) without downloading the body."""
    settings = get_settings()
    s3 = get_s3_client()
    try:
        response = s3.head_object(Bucket=settings.BUCKET_NAME, Key=key)
        return {
            "content_type": response.get("ContentType", "application/octet-stream"),
            "content_length": response.get("ContentLength", 0),
            "last_modified": response.get("LastModified"),
        }
    except Exception:
        return None


def get_s3_uri(key: str, bucket: str | None = None) -> str:
    """
    Return the s3://bucket/key URI for a given key.
    Useful for Bedrock Converse API s3Location document blocks.
    """
    settings = get_settings()
    bucket = bucket or settings.BUCKET_NAME
    return f"s3://{bucket}/{key}"


def extract_text_from_s3_object(key: str) -> Optional[str]:
    """
    Smart content reader: extracts text from any supported file type.

    - PDF files  → extracted via pypdf
    - Text files → decoded as UTF-8
    - Other      → returns None
    """
    raw_bytes = get_object_bytes(key)
    if raw_bytes is None:
        return None

    # PDF detection: starts with %PDF magic bytes
    if raw_bytes[:5] == b"%PDF-":
        return _extract_text_from_pdf(raw_bytes, key)

    # Try UTF-8 text
    try:
        return raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("S3 object %s is not a recognised text format", key)
        return None


def _extract_text_from_pdf(pdf_bytes: bytes, key: str = "") -> Optional[str]:
    """Extract text from PDF bytes using pypdf."""
    import io
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                pages.append(text)
        full_text = "\n\n".join(pages)
        if not full_text.strip():
            logger.warning("PDF %s has no extractable text (scanned/image PDF?)", key)
            return None
        logger.info("Extracted %d chars from PDF %s (%d pages)", len(full_text), key, len(reader.pages))
        return full_text
    except Exception as exc:
        logger.error("PDF text extraction failed for %s: %s", key, exc)
        return None


@_s3_retry("put_object")
def put_object(key: str, body: str, content_type: str = "text/plain") -> None:
    """Write content to S3.

    Resilience: circuit breaker + retry with exponential backoff.
    """
    settings = get_settings()
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.BUCKET_NAME,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType=content_type,
    )
    logger.info("Saved object to s3://%s/%s", settings.BUCKET_NAME, key)


@_s3_retry("delete_object")
def delete_object(key: str) -> None:
    """Delete an object from S3.

    Resilience: circuit breaker + retry with exponential backoff.
    """
    settings = get_settings()
    s3 = get_s3_client()
    s3.delete_object(Bucket=settings.BUCKET_NAME, Key=key)
    logger.info("Deleted s3://%s/%s", settings.BUCKET_NAME, key)


def list_objects(prefix: str, max_keys: int = 1000) -> list[dict]:
    """List objects under a prefix."""
    settings = get_settings()
    s3 = get_s3_client()
    try:
        response = s3.list_objects_v2(
            Bucket=settings.BUCKET_NAME, Prefix=prefix, MaxKeys=max_keys
        )
        return [
            {"key": obj["Key"], "size": obj["Size"], "last_modified": obj["LastModified"].isoformat()}
            for obj in response.get("Contents", [])
        ]
    except Exception as exc:
        raise StorageError(f"Failed to list files: {exc}")


# ════════════════════════════════════════════════════════════════
# Knowledge Base Bucket Operations (nixai-clinical-kb)
# ════════════════════════════════════════════════════════════════
@_s3_retry("copy_to_kb_bucket")
def copy_to_kb_bucket(source_key: str, dest_key: str | None = None) -> str:
    """
    Copy a file from the uploads bucket to the KB bucket for Bedrock indexing.

    Resilience: circuit breaker + retry with exponential backoff.

    Args:
        source_key: Key in the uploads bucket (e.g. "uploads/protocol.pdf")
        dest_key: Optional destination key; defaults to the filename under documents/

    Returns:
        The destination key in the KB bucket.
    """
    settings = get_settings()
    s3 = get_s3_client()
    if dest_key is None:
        filename = source_key.rsplit("/", 1)[-1]
        dest_key = f"documents/{filename}"
    s3.copy_object(
        CopySource={"Bucket": settings.BUCKET_NAME, "Key": source_key},
        Bucket=settings.KB_BUCKET_NAME,
        Key=dest_key,
    )
    logger.info(
        "Copied s3://%s/%s → s3://%s/%s",
        settings.BUCKET_NAME, source_key,
        settings.KB_BUCKET_NAME, dest_key,
    )
    return dest_key


@_s3_retry("put_object_to_kb_bucket")
def put_object_to_kb_bucket(
    key: str, body: str, content_type: str = "text/plain"
) -> None:
    """Write content directly to the KB bucket for Bedrock indexing.

    Resilience: circuit breaker + retry with exponential backoff.
    """
    settings = get_settings()
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.KB_BUCKET_NAME,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType=content_type,
    )
    logger.info("Saved to KB bucket: s3://%s/%s", settings.KB_BUCKET_NAME, key)
