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

import logging
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from boto3.dynamodb.conditions import Attr, Key

from app.core.aws_clients import get_dynamodb_table

logger = logging.getLogger(__name__)


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
    table.put_item(Item=_prepare_item(item))
    logger.info("Created document %s for user %s", doc_id, user_id)
    return _clean_item(item)


def get_document(doc_id: str) -> Optional[dict]:
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"DOC#{doc_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def list_documents(user_id: str) -> list[dict]:
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("DOC#"),
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


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
    table.update_item(
        Key={"PK": doc["PK"], "SK": doc["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    doc.update(updates)
    return _clean_item(doc)


def delete_document(doc_id: str) -> bool:
    doc = get_document(doc_id)
    if not doc:
        return False
    table = get_dynamodb_table()
    table.delete_item(Key={"PK": doc["PK"], "SK": doc["SK"]})
    logger.info("Deleted document %s", doc_id)
    return True


# ════════════════════════════════════════════════════════════════
# CHAT MESSAGES
# ════════════════════════════════════════════════════════════════
def create_chat_message(
    doc_id: str, user_id: str, role: str, text: str,
    citations: list = None, metadata: dict = None,
) -> dict:
    table = get_dynamodb_table()
    msg_id = _uuid()
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
    table.put_item(Item=_prepare_item(item))
    return _clean_item(item)


def get_chat_message(message_id: str) -> Optional[dict]:
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"MSG#{message_id}") & Key("GSI1SK").eq("#META"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def get_chat_history(doc_id: str) -> list[dict]:
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("MSG#"),
        ScanIndexForward=True,  # oldest first
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


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
    table.update_item(
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
    table.put_item(Item=_prepare_item(item))
    logger.info("Created job %s (%s) for user %s", job_id, job_type, user_id)
    return _clean_item(item)


def get_job(job_id: str) -> Optional[dict]:
    table = get_dynamodb_table()
    resp = table.query(
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
    table.update_item(
        Key={"PK": job["PK"], "SK": job["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    job.update(updates)
    return _clean_item(job)


def list_jobs(user_id: str, limit: int = 50) -> list[dict]:
    table = get_dynamodb_table()
    resp = table.query(
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
    table.put_item(Item=_prepare_item(item))
    return _clean_item(item)


def get_analysis_for_document(doc_id: str) -> Optional[dict]:
    """Get the most recent analysis for a document."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"DOC#{doc_id}") & Key("SK").begins_with("ANALYSIS#"),
        ScanIndexForward=False,
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None


def update_analysis(doc_id: str, analysis_id: str, updates: dict) -> Optional[dict]:
    table = get_dynamodb_table()
    key = {"PK": f"DOC#{doc_id}", "SK": f"ANALYSIS#{analysis_id}"}
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
KB_DOCS_PK = "KB#DOCS"


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
        "status": "uploaded",
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=_prepare_item(item))
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


def list_kb_documents() -> list[dict]:
    """List all KB documents (shared across all admins)."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(KB_DOCS_PK) & Key("SK").begins_with("KBDOC#"),
        ScanIndexForward=False,  # newest first
    )
    return [_clean_item(i) for i in resp.get("Items", [])]


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


def delete_kb_document(kb_doc_id: str) -> bool:
    """Delete a KB document record.

    Uses the deterministic PK/SK pattern directly to avoid an extra
    GSI lookup (the caller already verified existence).
    """
    table = get_dynamodb_table()
    table.delete_item(Key={"PK": KB_DOCS_PK, "SK": f"KBDOC#{kb_doc_id}"})
    logger.info("Deleted KB document %s", kb_doc_id)
    return True


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
    kb_jobs = [j for j in all_jobs if j.get("type") == "KB_SYNC"]
    if not kb_jobs:
        return None
    kb_jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return kb_jobs[0]
