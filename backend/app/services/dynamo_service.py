"""
NIX AI — DynamoDB Service

Single-table design with entity prefixes:
  PK                  | SK                              | Entity
  ────────────────────|─────────────────────────────────|────────
  USER#{user_id}      | DOC#{doc_id}                    | Document
  DOC#{doc_id}        | MSG#{timestamp}#{msg_id}        | ChatMessage
  DOC#{doc_id}        | ANALYSIS#{analysis_id}          | Analysis
  USER#{user_id}      | JOB#{job_id}                    | Job

GSI1 (reverse lookup):
  GSI1PK              | GSI1SK
  DOC#{doc_id}        | #META                           | → Document by ID
  JOB#{job_id}        | #META                           | → Job by ID
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
import random
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from boto3.dynamodb.conditions import Attr, Key

from app.core.aws_clients import get_dynamodb_table
from app.core.resilience import dynamodb_circuit, CircuitBreakerError

logger = logging.getLogger(__name__)

# DynamoDB retry config for transient failures (throttling, 5xx)
_MAX_RETRIES = 3
_BASE_DELAY = 0.2  # seconds


def _dynamo_op(operation_name: str, func, *args, **kwargs):
    """Execute a DynamoDB operation with circuit breaker + retry.

    Wraps all DynamoDB calls to provide:
    - Circuit breaker: prevents cascading failures when DynamoDB is degraded
    - Retry with exponential backoff: handles transient throttling/5xx errors
    """
    last_exc = None
    for attempt in range(_MAX_RETRIES):
        try:
            dynamodb_circuit.before_call()
            result = func(*args, **kwargs)
            dynamodb_circuit.on_success()
            return result
        except CircuitBreakerError:
            logger.error("DynamoDB circuit breaker OPEN — cannot perform %s", operation_name)
            raise
        except Exception as exc:
            dynamodb_circuit.on_failure()
            last_exc = exc
            error_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            # Don't retry validation/client errors
            if error_code in (
                "ValidationException", "ConditionalCheckFailedException",
                "ResourceNotFoundException", "AccessDeniedException",
            ):
                raise
            if attempt < _MAX_RETRIES - 1:
                delay = _BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.15)
                logger.warning(
                    "DynamoDB %s attempt %d/%d failed: %s — retrying in %.2fs",
                    operation_name, attempt + 1, _MAX_RETRIES, exc, delay,
                )
                time.sleep(delay)
            else:
                logger.error("DynamoDB %s failed after %d attempts: %s", operation_name, _MAX_RETRIES, exc)
                raise


# ── Helpers ──────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return uuid.uuid4().hex[:16]


def _clean_value(value):
    """Recursively convert Decimal → int/float for JSON serialisation."""
    if isinstance(value, Decimal):
        return int(value) if value == int(value) else float(value)
    if isinstance(value, dict):
        return {k: _clean_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean_value(item) for item in value]
    return value


def _clean_item(item: dict) -> dict:
    """Convert Decimal back to int/float for JSON serialisation."""
    return {k: _clean_value(v) for k, v in item.items()}


def _prepare_value(value):
    """Recursively convert float → Decimal for DynamoDB writes.

    DynamoDB's boto3 resource layer does NOT accept Python float types;
    all floating-point numbers must be wrapped in Decimal.
    """
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _prepare_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_prepare_value(item) for item in value]
    return value


def _prepare_item(item: dict) -> dict:
    """Prepare a full item dict for DynamoDB by converting floats → Decimals."""
    return {k: _prepare_value(v) for k, v in item.items()}


# ════════════════════════════════════════════════════════════════
# DOCUMENTS
# ════════════════════════════════════════════════════════════════
def create_document(
    user_id: str, name: str, s3_key: str, size: int = 0
) -> dict:
    table = get_dynamodb_table()
    doc_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"DOC#{doc_id}",
        "GSI1PK": f"DOC#{doc_id}",
        "GSI1SK": "#META",
        "entity": "DOCUMENT",
        "id": doc_id,
        "user_id": user_id,
        "name": name,
        "s3_key": s3_key,
        "size": size,
        "status": "uploaded",
        "created_at": now,
        "updated_at": now,
    }
    _dynamo_op("create_document", table.put_item, Item=_prepare_item(item))
    logger.info("Created document %s for user %s", doc_id, user_id)
    return _clean_item(item)


def get_document(doc_id: str) -> Optional[dict]:
    table = get_dynamodb_table()
    resp = _dynamo_op(
        "get_document",
        table.query,
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"DOC#{doc_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def list_documents(user_id: str) -> list[dict]:
    table = get_dynamodb_table()
    items: list[dict] = []
    params = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("DOC#"),
        "ConsistentRead": True,  # Strong consistency — prevents stale reads after deletion
    }
    while True:
        resp = _dynamo_op("list_documents", table.query, **params)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return [_clean_item(i) for i in items]


def update_document(doc_id: str, updates: dict) -> Optional[dict]:
    doc = get_document(doc_id)
    if not doc:
        return None
    table = get_dynamodb_table()
    updates["updated_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    _dynamo_op(
        "update_document",
        table.update_item,
        Key={"PK": doc["PK"], "SK": doc["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    doc.update(updates)
    return _clean_item(doc)


def delete_document(doc_id: str, pk: str | None = None, sk: str | None = None) -> bool:
    """Delete a document record from DynamoDB.

    If *pk* and *sk* are provided (from an already-fetched doc), skips
    the redundant GSI lookup.
    """
    if pk and sk:
        table = get_dynamodb_table()
        _dynamo_op("delete_document", table.delete_item, Key={"PK": pk, "SK": sk})
        logger.info("Deleted document %s", doc_id)
        return True
    doc = get_document(doc_id)
    if not doc:
        return False
    table = get_dynamodb_table()
    _dynamo_op("delete_document", table.delete_item, Key={"PK": doc["PK"], "SK": doc["SK"]})
    logger.info("Deleted document %s", doc_id)
    return True


# ════════════════════════════════════════════════════════════════
# CHAT MESSAGES
# ════════════════════════════════════════════════════════════════
def create_chat_message(
    doc_id: str, user_id: str, role: str, text: str,
    citations: list = None, metadata: dict = None,
    message_id: str = None,
) -> dict:
    table = get_dynamodb_table()
    msg_id = message_id or _uuid()
    ts = int(time.time() * 1000)
    now = _now_iso()
    item = {
        "PK": f"DOC#{doc_id}",
        "SK": f"MSG#{ts}#{msg_id}",
        "GSI1PK": f"MSG#{msg_id}",
        "GSI1SK": "#META",
        "entity": "CHAT_MESSAGE",
        "id": msg_id,
        "doc_id": doc_id,
        "user_id": user_id,
        "role": role,
        "text": text,
        "citations": citations or [],
        "metadata": metadata or {},
        "created_at": now,
    }
    _dynamo_op("create_chat_message", table.put_item, Item=_prepare_item(item))
    return _clean_item(item)


def get_chat_message(message_id: str) -> Optional[dict]:
    table = get_dynamodb_table()
    resp = _dynamo_op(
        "get_chat_message",
        table.query,
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"MSG#{message_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def get_chat_history(doc_id: str) -> list[dict]:
    table = get_dynamodb_table()
    items: list[dict] = []
    params = {
        "KeyConditionExpression": Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("MSG#"),
        "ScanIndexForward": True,  # oldest first
    }
    while True:
        resp = _dynamo_op("get_chat_history", table.query, **params)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return [_clean_item(i) for i in items]


def update_chat_message(message_id: str, updates: dict) -> Optional[dict]:
    """Update a chat message (e.g. to store feedback metadata)."""
    msg = get_chat_message(message_id)
    if not msg:
        return None
    table = get_dynamodb_table()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    _dynamo_op(
        "update_chat_message",
        table.update_item,
        Key={"PK": msg["PK"], "SK": msg["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    msg.update(updates)
    return _clean_item(msg)


def delete_chat_history(doc_id: str) -> int:
    table = get_dynamodb_table()
    messages = get_chat_history(doc_id)
    count = 0
    with table.batch_writer() as batch:
        for msg in messages:
            batch.delete_item(Key={"PK": msg["PK"], "SK": msg["SK"]})
            count += 1
    logger.info("Deleted %d messages for doc %s", count, doc_id)
    return count


def delete_analyses_for_document(doc_id: str) -> int:
    """Delete all ANALYSIS records for a document (cascade cleanup)."""
    table = get_dynamodb_table()
    count = 0
    params = {
        "KeyConditionExpression": Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("ANALYSIS#"),
    }
    while True:
        resp = table.query(**params)
        items = resp.get("Items", [])
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                count += 1
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    if count:
        logger.info("Deleted %d analysis records for doc %s", count, doc_id)
    return count


def delete_simulations_for_document(doc_id: str) -> int:
    """Delete all SIM records for a document (cascade cleanup)."""
    table = get_dynamodb_table()
    count = 0
    params = {
        "KeyConditionExpression": Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("SIM#"),
    }
    while True:
        resp = table.query(**params)
        items = resp.get("Items", [])
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                count += 1
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    if count:
        logger.info("Deleted %d simulation records for doc %s", count, doc_id)
    return count


def cancel_jobs_for_document(user_id: str, doc_id: str) -> int:
    """Cancel all QUEUED/IN_PROGRESS jobs linked to a document."""
    jobs = list_jobs(user_id, limit=100)
    count = 0
    for job in jobs:
        params = job.get("params", {}) or {}
        if params.get("document_id") != doc_id:
            continue
        if job.get("status") in ("QUEUED", "IN_PROGRESS"):
            update_job(job["id"], {"status": "CANCELLED", "error": "Document deleted"})
            count += 1
    if count:
        logger.info("Cancelled %d active jobs for doc %s", count, doc_id)
    return count


# ════════════════════════════════════════════════════════════════
# JOBS
# ════════════════════════════════════════════════════════════════
def create_job(
    user_id: str, job_type: str, params: dict = None
) -> dict:
    table = get_dynamodb_table()
    job_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"JOB#{job_id}",
        "GSI1PK": f"JOB#{job_id}",
        "GSI1SK": "#META",
        "entity": "JOB",
        "id": job_id,
        "user_id": user_id,
        "type": job_type,
        "status": "QUEUED",
        "params": params or {},
        "result": None,
        "error": None,
        "progress": 0,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }
    _dynamo_op("create_job", table.put_item, Item=_prepare_item(item))
    logger.info("Created job %s (%s) for user %s", job_id, job_type, user_id)
    return _clean_item(item)


def get_job(job_id: str) -> Optional[dict]:
    table = get_dynamodb_table()
    resp = _dynamo_op(
        "get_job",
        table.query,
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"JOB#{job_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def update_job(job_id: str, updates: dict) -> Optional[dict]:
    job = get_job(job_id)
    if not job:
        return None
    table = get_dynamodb_table()
    updates["updated_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    _dynamo_op(
        "update_job",
        table.update_item,
        Key={"PK": job["PK"], "SK": job["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    job.update(updates)
    return _clean_item(job)


def list_jobs(user_id: str, limit: int = 50) -> list[dict]:
    table = get_dynamodb_table()
    resp = _dynamo_op(
        "list_jobs",
        table.query,
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("JOB#"),
        ScanIndexForward=False,  # newest first
        Limit=limit,
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


def get_jobs_by_ids(job_ids: list[str]) -> list[dict]:
    """Batch get jobs by their IDs using GSI."""
    results = []
    for jid in job_ids:
        job = get_job(jid)
        if job:
            results.append(job)
    return results


# ════════════════════════════════════════════════════════════════
# ANALYSIS
# ════════════════════════════════════════════════════════════════
def create_analysis(doc_id: str, job_id: str) -> dict:
    table = get_dynamodb_table()
    analysis_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"DOC#{doc_id}",
        "SK": f"ANALYSIS#{analysis_id}",
        "GSI1PK": f"JOB#{job_id}",
        "GSI1SK": f"ANALYSIS#{analysis_id}",
        "entity": "ANALYSIS",
        "id": analysis_id,
        "doc_id": doc_id,
        "job_id": job_id,
        "status": "QUEUED",
        "regulator_score": 0,
        "payer_score": 0,
        "findings": [],
        "summary": "",
        "created_at": now,
        "completed_at": None,
    }
    _dynamo_op("create_analysis", table.put_item, Item=_prepare_item(item))
    return _clean_item(item)


def get_analysis_for_document(doc_id: str) -> Optional[dict]:
    """Get the most recent analysis for a document."""
    table = get_dynamodb_table()
    resp = _dynamo_op(
        "get_analysis_for_document",
        table.query,
        KeyConditionExpression=Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("ANALYSIS#"),
        ScanIndexForward=False,
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def update_analysis(doc_id: str, analysis_id: str, updates: dict) -> Optional[dict]:
    table = get_dynamodb_table()
    key = {"PK": f"DOC#{doc_id}", "SK": f"ANALYSIS#{analysis_id}"}
    # Only set completed_at when the analysis reaches a terminal state
    if updates.get("status") in ("COMPLETE", "FAILED"):
        updates["completed_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    _dynamo_op(
        "update_analysis",
        table.update_item,
        Key=key,
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    return updates


# ════════════════════════════════════════════════════════════════
# KB DOCUMENTS (Admin-curated reference docs for Bedrock RAG)
#
#   PK:     KB#DOCS
#   SK:     KBDOC#{kb_doc_id}
#   GSI1PK: KBDOC#{kb_doc_id}
#   GSI1SK: #META
#
# These are completely separate from user DOCUMENT entities.
# KB documents live in the KB S3 bucket (nixai-clinical-kb) and
# are indexed by Bedrock.  User documents live in the uploads
# bucket (nixai-clinical-uploads) and are NEVER sent to RAG.
# ════════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════════
# AMENDMENT SIMULATIONS  (REQ-3)
#
#   PK:     DOC#{doc_id}
#   SK:     SIM#{sim_id}
#   GSI1PK: JOB#{job_id}
#   GSI1SK: SIM#{sim_id}
# ════════════════════════════════════════════════════════════════
def create_simulation(
    doc_id: str,
    job_id: str,
    amendment_text: str,
    user_id: str,
) -> dict:
    """Create a simulation record for an amendment impact analysis."""
    table = get_dynamodb_table()
    sim_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"DOC#{doc_id}",
        "SK": f"SIM#{sim_id}",
        "GSI1PK": f"JOB#{job_id}",
        "GSI1SK": f"SIM#{sim_id}",
        "entity": "SIMULATION",
        "id": sim_id,
        "doc_id": doc_id,
        "job_id": job_id,
        "user_id": user_id,
        "amendment_text": amendment_text,
        "status": "QUEUED",
        "result": None,
        "created_at": now,
        "completed_at": None,
    }
    _dynamo_op("create_simulation", table.put_item, Item=_prepare_item(item))
    logger.info("Created simulation %s for doc %s", sim_id, doc_id)
    return _clean_item(item)


def get_simulations_for_document(doc_id: str) -> list[dict]:
    """Get all simulations for a document."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("SIM#"),
        ScanIndexForward=False,
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


def update_simulation(doc_id: str, sim_id: str, updates: dict) -> Optional[dict]:
    """Update a simulation record."""
    table = get_dynamodb_table()
    key = {"PK": f"DOC#{doc_id}", "SK": f"SIM#{sim_id}"}
    # Only set completed_at on terminal states
    if updates.get("status") in ("COMPLETE", "FAILED"):
        updates["completed_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    table.update_item(
        Key=key,
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    return updates


# ════════════════════════════════════════════════════════════════
# PROTOCOL COMPARISONS  (REQ-6)
#
#   PK:     USER#{user_id}
#   SK:     CMP#{cmp_id}
#   GSI1PK: CMP#{cmp_id}
#   GSI1SK: #META
# ════════════════════════════════════════════════════════════════
def create_comparison(
    user_id: str,
    document_ids: list[str],
    job_id: str,
) -> dict:
    """Create a comparison record."""
    table = get_dynamodb_table()
    cmp_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"CMP#{cmp_id}",
        "GSI1PK": f"CMP#{cmp_id}",
        "GSI1SK": "#META",
        "entity": "COMPARISON",
        "id": cmp_id,
        "user_id": user_id,
        "document_ids": document_ids,
        "job_id": job_id,
        "status": "QUEUED",
        "result": None,
        "created_at": now,
        "completed_at": None,
    }
    table.put_item(Item=_prepare_item(item))
    logger.info("Created comparison %s for user %s", cmp_id, user_id)
    return _clean_item(item)


def get_comparison(cmp_id: str) -> Optional[dict]:
    """Get a comparison by ID via GSI1."""
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"CMP#{cmp_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def update_comparison(cmp_id: str, updates: dict) -> Optional[dict]:
    """Update a comparison record."""
    cmp = get_comparison(cmp_id)
    if not cmp:
        return None
    table = get_dynamodb_table()
    # Only set completed_at for terminal states
    status = updates.get("status", "")
    if status in ("COMPLETE", "FAILED", "CANCELLED"):
        updates["completed_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    table.update_item(
        Key={"PK": cmp["PK"], "SK": cmp["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    cmp.update(updates)
    return _clean_item(cmp)


def list_comparisons(user_id: str) -> list[dict]:
    """List all comparisons for a user."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("CMP#"),
        ScanIndexForward=False,
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


KB_DOCS_PK = "KB#DOCS"
KB_INGESTION_PK = "KB#INGESTION"


def _content_hash_for_version(name: str, s3_key: str, size: int) -> str:
    """Best-effort deterministic content signature for KB version tracking.

    Uses metadata fallback (name + key + size) when file bytes are not available.
    """
    raw = f"{name}|{s3_key}|{size}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_kb_document(
    uploaded_by: str,
    name: str,
    s3_key: str,
    size: int = 0,
    description: str = "",
    category: str = "general",
) -> dict:
    """Create a KB document record (admin-curated reference material)."""
    table = get_dynamodb_table()
    kb_doc_id = _uuid()
    now = _now_iso()
    item = {
        "PK": KB_DOCS_PK,
        "SK": f"KBDOC#{kb_doc_id}",
        "GSI1PK": f"KBDOC#{kb_doc_id}",
        "GSI1SK": "#META",
        "entity": "KB_DOCUMENT",
        "id": kb_doc_id,
        "uploaded_by": uploaded_by,
        "name": name,
        "s3_key": s3_key,
        "size": size,
        "description": description,
        "category": category,
        "status": "sync_pending",
        "bedrock_sync_pending": True,
        "current_version": 1,
        "versions": [
            {
                "version": 1,
                "name": name,
                "s3_key": s3_key,
                "size": size,
                "hash": _content_hash_for_version(name, s3_key, size),
                "changed_by": uploaded_by,
                "change_note": "Initial upload",
                "created_at": now,
            }
        ],
        "last_synced_at": None,
        "last_sync_job_id": None,
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=_prepare_item(item))
    create_kb_change_record(
        kb_doc_id=kb_doc_id,
        changed_by=uploaded_by,
        change_type="CREATED",
        details={
            "name": name,
            "s3_key": s3_key,
            "size": size,
            "category": category,
        },
    )
    logger.info("Created KB document %s (category=%s) by %s", kb_doc_id, category, uploaded_by)
    return _clean_item(item)


def get_kb_document(kb_doc_id: str) -> Optional[dict]:
    """Get a single KB document by ID via GSI1."""
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"KBDOC#{kb_doc_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def list_kb_documents(include_deleted: bool = False) -> list[dict]:
    """List all KB documents (shared across all admins)."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(KB_DOCS_PK) & Key("SK").begins_with("KBDOC#"),
        ScanIndexForward=False,  # newest first
    )
    items = [_clean_item(i) for i in resp.get("Items", [])]
    if include_deleted:
        return items
    return [i for i in items if i.get("status") != "deleted"]


def update_kb_document(kb_doc_id: str, updates: dict) -> Optional[dict]:
    """Update a KB document record."""
    doc = get_kb_document(kb_doc_id)
    if not doc:
        return None
    table = get_dynamodb_table()
    updates["updated_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    table.update_item(
        Key={"PK": doc["PK"], "SK": doc["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    doc.update(updates)
    return _clean_item(doc)


def delete_kb_document(kb_doc_id: str, hard_delete: bool = False) -> bool:
    """Delete or soft-delete a KB document record.

    Soft delete is the default to preserve auditability until Bedrock re-sync
    confirms deletion propagation.
    """
    if not hard_delete:
        return bool(update_kb_document(kb_doc_id, {"status": "deleted"}))

    # Hard delete path
    table = get_dynamodb_table()
    table.delete_item(Key={"PK": KB_DOCS_PK, "SK": f"KBDOC#{kb_doc_id}"})
    logger.info("Deleted KB document %s", kb_doc_id)
    return True


def create_kb_change_record(
    kb_doc_id: str,
    changed_by: str,
    change_type: str,
    details: dict,
) -> dict:
    """Create an immutable audit entry for KB document changes."""
    table = get_dynamodb_table()
    change_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"KBDOC#{kb_doc_id}",
        "SK": f"CHANGE#{now}#{change_id}",
        "GSI1PK": f"KBCHANGE#{kb_doc_id}",
        "GSI1SK": f"CHANGE#{now}",
        "entity": "KB_CHANGE",
        "id": change_id,
        "kb_doc_id": kb_doc_id,
        "changed_by": changed_by,
        "change_type": change_type,
        "details": details,
        "created_at": now,
    }
    table.put_item(Item=_prepare_item(item))
    return _clean_item(item)


def list_kb_change_records(kb_doc_id: str, limit: int = 100) -> list[dict]:
    """List change history for one KB document (newest first)."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"KBDOC#{kb_doc_id}") & Key("SK").begins_with("CHANGE#"),
        ScanIndexForward=False,
        Limit=limit,
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


def create_kb_ingestion_record(
    sync_job_id: str,
    knowledge_base_id: str,
    data_source_id: str,
    ingestion_job_id: str,
    category: str | None = None,
    only_changed: bool = False,
    affected_doc_ids: list[str] | None = None,
) -> dict:
    """Track a Bedrock ingestion job for observability and reconciliation."""
    table = get_dynamodb_table()
    now = _now_iso()
    ing_id = _uuid()
    item = {
        "PK": KB_INGESTION_PK,
        "SK": f"INGESTION#{ingestion_job_id}",
        "GSI1PK": f"JOB#{sync_job_id}",
        "GSI1SK": f"INGESTION#{ingestion_job_id}",
        "entity": "KB_INGESTION",
        "id": ing_id,
        "sync_job_id": sync_job_id,
        "knowledge_base_id": knowledge_base_id,
        "data_source_id": data_source_id,
        "ingestion_job_id": ingestion_job_id,
        "status": "STARTED",
        "category": category,
        "only_changed": only_changed,
        "affected_doc_ids": affected_doc_ids or [],
        "started_at": now,
        "completed_at": None,
        "error": None,
        "stats": {},
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=_prepare_item(item))
    return _clean_item(item)


def get_kb_ingestion_record(ingestion_job_id: str) -> Optional[dict]:
    """Get one KB ingestion record by Bedrock ingestion job id."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(KB_INGESTION_PK) & Key("SK").eq(f"INGESTION#{ingestion_job_id}"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def update_kb_ingestion_record(ingestion_job_id: str, updates: dict) -> Optional[dict]:
    """Update a tracked KB ingestion job."""
    rec = get_kb_ingestion_record(ingestion_job_id)
    if not rec:
        return None
    table = get_dynamodb_table()
    updates["updated_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    table.update_item(
        Key={"PK": rec["PK"], "SK": rec["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    rec.update(updates)
    return _clean_item(rec)


def list_kb_ingestions_for_job(sync_job_id: str) -> list[dict]:
    """List ingestion records created for one sync job."""
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"JOB#{sync_job_id}") & Key("GSI1SK").begins_with("INGESTION#"),
        ScanIndexForward=True,
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


def get_kb_stats() -> dict:
    """Get KB statistics (counts, sizes by category)."""
    docs = list_kb_documents()
    categories: dict = {}
    total_size = 0
    for d in docs:
        cat = d.get("category", "general")
        categories[cat] = categories.get(cat, 0) + 1
        total_size += d.get("size", 0)
    return {
        "total_documents": len(docs),
        "total_size": total_size,
        "categories": categories,
    }


# ════════════════════════════════════════════════════════════════
# ADMIN SCANS  (cross-partition queries for platform analytics)
# ════════════════════════════════════════════════════════════════

def scan_all_entities(entity_type: str) -> list[dict]:
    """Full-table scan filtered by entity type (admin analytics)."""
    table = get_dynamodb_table()
    items: list[dict] = []
    params: dict = {"FilterExpression": Attr("entity").eq(entity_type)}
    while True:
        resp = table.scan(**params)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return [_clean_item(i) for i in items]


def scan_all_documents() -> list[dict]:
    """Return every DOCUMENT entity across all users."""
    return scan_all_entities("DOCUMENT")


def scan_all_jobs() -> list[dict]:
    """Return every JOB entity across all users."""
    return scan_all_entities("JOB")


def scan_all_analyses() -> list[dict]:
    """Return every ANALYSIS entity across all users."""
    return scan_all_entities("ANALYSIS")


def scan_all_chat_messages() -> list[dict]:
    """Return every CHAT_MESSAGE entity across all users."""
    return scan_all_entities("CHAT_MESSAGE")


def count_chat_messages_for_document(doc_id: str) -> dict:
    """Count chat messages for a document, split by role."""
    messages = get_chat_history(doc_id)
    user_msgs = sum(1 for m in messages if m.get("role") == "user")
    assistant_msgs = sum(1 for m in messages if m.get("role") == "assistant")
    total_citations = 0
    for m in messages:
        if m.get("role") == "assistant":
            cites = m.get("citations") or []
            if isinstance(cites, list):
                total_citations += len(cites)
    return {
        "total": len(messages),
        "user_messages": user_msgs,
        "assistant_messages": assistant_msgs,
        "total_citations": total_citations,
    }


def get_last_kb_sync_job() -> Optional[dict]:
    """Find the most recent KB_SYNC job across all users."""
    all_jobs = scan_all_jobs()
    kb_jobs = [j for j in all_jobs if j.get("type") in ("SYNC_KB", "SYNC_KB_DELETE")]
    if not kb_jobs:
        return None
    kb_jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return kb_jobs[0]


# ════════════════════════════════════════════════════════════════
# ADVERSARIAL BOARDROOM DEBATES
#
#   PK:     USER#{user_id}
#   SK:     DEBATE#{debate_id}
#   GSI1PK: DEBATE#{debate_id}
#   GSI1SK: #META
#
# Each debate is a multi-agent discussion about a document.
# The transcript is stored as a list and updated in real-time
# (appended turn-by-turn) so the frontend can poll and animate.
# ════════════════════════════════════════════════════════════════

def create_debate(
    user_id: str,
    doc_id: str,
    job_id: str,
) -> dict:
    """Create a new debate record for the Adversarial Boardroom."""
    table = get_dynamodb_table()
    debate_id = _uuid()
    now = _now_iso()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"DEBATE#{debate_id}",
        "GSI1PK": f"DEBATE#{debate_id}",
        "GSI1SK": "#META",
        "entity": "DEBATE",
        "id": debate_id,
        "user_id": user_id,
        "doc_id": doc_id,
        "job_id": job_id,
        "status": "QUEUED",
        "progress": 0,
        "protocol_name": "",
        "scores": {},
        "current_round": 0,
        "total_rounds": 0,
        "current_topic": "",
        "transcript": [],
        "final_verdict": None,
        "total_turns": 0,
        "rounds_completed": 0,
        "elapsed_seconds": 0,
        "error": None,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }
    table.put_item(Item=_prepare_item(item))
    logger.info("Created debate %s for doc %s", debate_id, doc_id)
    return _clean_item(item)


def get_debate(debate_id: str) -> Optional[dict]:
    """Get a debate by ID via GSI1."""
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"DEBATE#{debate_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def get_debates_for_document(doc_id: str, user_id: str) -> list[dict]:
    """List all debates for a specific document."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("DEBATE#"),
    )
    debates = [_clean_item(i) for i in resp.get("Items", [])]
    return [d for d in debates if d.get("doc_id") == doc_id]


def update_debate(debate_id: str, updates: dict) -> Optional[dict]:
    """Update a debate record."""
    debate = get_debate(debate_id)
    if not debate:
        return None
    table = get_dynamodb_table()
    updates["updated_at"] = _now_iso()
    if updates.get("status") in ("COMPLETED", "FAILED"):
        updates["completed_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    table.update_item(
        Key={"PK": debate["PK"], "SK": debate["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    debate.update(updates)
    return _clean_item(debate)


def append_debate_transcript_turn(debate_id: str, turn_data: dict) -> None:
    """Atomically append a single debate turn to the transcript array.

    Uses DynamoDB list_append for atomic, concurrent-safe appends.
    This is the KEY operation for real-time UI updates — each turn is
    appended immediately so the frontend can poll and animate.
    """
    debate = get_debate(debate_id)
    if not debate:
        logger.error("Debate %s not found for transcript append", debate_id)
        return
    table = get_dynamodb_table()
    prepared_turn = _prepare_value(turn_data)
    table.update_item(
        Key={"PK": debate["PK"], "SK": debate["SK"]},
        UpdateExpression=(
            "SET #transcript = list_append(if_not_exists(#transcript, :empty), :turn), "
            "#updated_at = :now"
        ),
        ExpressionAttributeNames={
            "#transcript": "transcript",
            "#updated_at": "updated_at",
        },
        ExpressionAttributeValues={
            ":turn": [prepared_turn],
            ":empty": [],
            ":now": _now_iso(),
        },
    )
    logger.info("Appended turn from %s to debate %s", turn_data.get("agent", "unknown"), debate_id)


def get_latest_debate_for_document(doc_id: str, user_id: str) -> Optional[dict]:
    """Get the most recent debate for a document."""
    debates = get_debates_for_document(doc_id, user_id)
    if not debates:
        return None
    debates.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return debates[0]


# ════════════════════════════════════════════════════════════════
# STRATEGIC INTELLIGENCE CACHE
#
#   PK:     DOC#{doc_id}
#   SK:     STRATEGIC#{feature_key}  (e.g. friction_map, cost_analysis)
#
# Caches expensive AI-generated strategic results per document so
# they survive page reloads without wasting tokens.  Each record
# stores the full result JSON, a generated_at timestamp, and a
# content_hash of the analysis that was used as input.  When the
# underlying analysis changes (re-run), the hash won't match and
# the frontend can prompt the user to regenerate.
# ════════════════════════════════════════════════════════════════

STRATEGIC_FEATURES = {
    "friction_map",
    "cost_analysis",
    "payer_simulation",
    "submission_strategy",
    "optimization",
    "watchdog",
    "clause_library",
    "investor_report",
    "council",          # sync council (legacy)
    "council_debate",   # async boardroom debate (full transcript + verdict)
}


def save_strategic_result(
    doc_id: str,
    feature_key: str,
    result: dict,
    analysis_hash: str = "",
) -> dict:
    """Cache a strategic intelligence result for a document.

    Args:
        doc_id: The document ID.
        feature_key: One of STRATEGIC_FEATURES (e.g. "friction_map").
        result: The full JSON result from the AI.
        analysis_hash: Hash of the analysis data used as input. When the
            analysis changes, the hash won't match → stale indicator.
    """
    if feature_key not in STRATEGIC_FEATURES:
        logger.warning("Unknown strategic feature key: %s", feature_key)

    table = get_dynamodb_table()
    now = _now_iso()

    # TTL: auto-expire after 30 days to garbage-collect orphaned caches
    ttl_seconds = 30 * 24 * 60 * 60  # 30 days
    ttl_epoch = int(time.time()) + ttl_seconds

    item = {
        "PK": f"DOC#{doc_id}",
        "SK": f"STRATEGIC#{feature_key}",
        "entity": "STRATEGIC_CACHE",
        "doc_id": doc_id,
        "feature_key": feature_key,
        "result": result,
        "analysis_hash": analysis_hash,
        "generated_at": now,
        "updated_at": now,
        "ttl": ttl_epoch,
    }
    table.put_item(Item=_prepare_item(item))
    logger.info("Cached strategic result '%s' for doc %s", feature_key, doc_id)
    return _clean_item(item)


def get_strategic_result(doc_id: str, feature_key: str) -> Optional[dict]:
    """Retrieve a cached strategic intelligence result.

    Returns None if no cache exists for this doc+feature combination.
    """
    table = get_dynamodb_table()
    resp = table.get_item(
        Key={"PK": f"DOC#{doc_id}", "SK": f"STRATEGIC#{feature_key}"},
    )
    item = resp.get("Item")
    return _clean_item(item) if item else None


def get_all_strategic_results(doc_id: str) -> dict:
    """Retrieve ALL cached strategic results for a document.

    Returns a dict keyed by feature_key → {result, generated_at, analysis_hash}.
    Handles DynamoDB pagination in case results exceed 1MB.
    """
    table = get_dynamodb_table()
    all_items: list[dict] = []
    params = {
        "KeyConditionExpression": (
            Key("PK").eq(f"DOC#{doc_id}")
            & Key("SK").begins_with("STRATEGIC#")
        ),
    }
    while True:
        resp = table.query(**params)
        all_items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    results = {}
    for item in all_items:
        cleaned = _clean_item(item)
        fk = cleaned.get("feature_key", "")
        results[fk] = {
            "result": cleaned.get("result", {}),
            "generated_at": cleaned.get("generated_at"),
            "analysis_hash": cleaned.get("analysis_hash", ""),
        }
    return results


def delete_strategic_results(doc_id: str) -> int:
    """Delete ALL cached strategic results for a document (e.g. on re-analysis).

    Handles DynamoDB pagination to ensure every item is deleted.
    """
    table = get_dynamodb_table()
    all_keys: list[dict] = []
    params = {
        "KeyConditionExpression": (
            Key("PK").eq(f"DOC#{doc_id}")
            & Key("SK").begins_with("STRATEGIC#")
        ),
        "ProjectionExpression": "PK, SK",
    }
    while True:
        resp = table.query(**params)
        all_keys.extend(
            {"PK": item["PK"], "SK": item["SK"]} for item in resp.get("Items", [])
        )
        if "LastEvaluatedKey" not in resp:
            break
        params["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    count = 0
    with table.batch_writer() as batch:
        for key in all_keys:
            batch.delete_item(Key=key)
            count += 1
    if count:
        logger.info("Deleted %d strategic cache records for doc %s", count, doc_id)
    return count
