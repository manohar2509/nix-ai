"""
Worker Task — Knowledge Base Sync

Triggers a sync of the Bedrock Knowledge Base data source so newly
uploaded documents are indexed and searchable via RAG.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from app.core.aws_clients import get_bedrock_agent_admin_client
from app.core.config import get_settings
from app.services import dynamo_service

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 3
MAX_INGESTION_WAIT_SECONDS = 300


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _select_affected_docs(category: str | None, only_changed: bool, include_deleted: bool) -> list[dict]:
    docs = dynamo_service.list_kb_documents(include_deleted=include_deleted)
    if category:
        docs = [d for d in docs if d.get("category") == category]
    if only_changed:
        docs = [d for d in docs if d.get("bedrock_sync_pending")]
    return docs


def _wait_for_ingestion_completion(
    bedrock_agent,
    knowledge_base_id: str,
    data_source_id: str,
    ingestion_job_id: str,
) -> dict:
    """Poll Bedrock ingestion status until completion/failure/timeout."""
    started = time.time()
    last_status = "STARTED"

    while True:
        elapsed = int(time.time() - started)
        if elapsed > MAX_INGESTION_WAIT_SECONDS:
            raise TimeoutError(
                f"Ingestion job {ingestion_job_id} timed out after {MAX_INGESTION_WAIT_SECONDS}s "
                f"(last status={last_status})"
            )

        response = bedrock_agent.get_ingestion_job(
            knowledgeBaseId=knowledge_base_id,
            dataSourceId=data_source_id,
            ingestionJobId=ingestion_job_id,
        )
        ingestion = response.get("ingestionJob", {})
        status = ingestion.get("status", "UNKNOWN")
        last_status = status

        if status in ("COMPLETE", "FAILED", "STOPPED"):
            return ingestion

        time.sleep(POLL_INTERVAL_SECONDS)


def process_kb_sync(payload: dict) -> None:
    """
    Trigger a Bedrock Knowledge Base data source sync.

    Payload:
        job_id: str
        user_id: str
        sync_params: {
            category?: str
            only_changed?: bool
            purge_deleted?: bool
            deleted_doc_id?: str
        }
    """
    job_id = payload["job_id"]
    settings = get_settings()
    sync_params = payload.get("sync_params") or {}
    category = sync_params.get("category")
    only_changed = bool(sync_params.get("only_changed", False))
    purge_deleted = bool(sync_params.get("purge_deleted", False))
    deleted_doc_id = sync_params.get("deleted_doc_id")

    dynamo_service.update_job(job_id, {"status": "IN_PROGRESS", "progress": 10})

    if not settings.BEDROCK_KB_ID:
        logger.warning("BEDROCK_KB_ID not set — skipping KB sync")
        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {"message": "KB sync skipped — no KB_ID configured"},
        })
        return

    try:
        bedrock_agent = get_bedrock_agent_admin_client()

        affected_docs = _select_affected_docs(
            category=category,
            only_changed=only_changed,
            include_deleted=purge_deleted,
        )
        affected_doc_ids = [d.get("id", "") for d in affected_docs if d.get("id")]

        # List data sources for the Knowledge Base
        ds_response = bedrock_agent.list_data_sources(
            knowledgeBaseId=settings.BEDROCK_KB_ID,
            maxResults=10,
        )
        data_sources = ds_response.get("dataSourceSummaries", [])

        if not data_sources:
            logger.warning("No data sources found for KB %s", settings.BEDROCK_KB_ID)
            dynamo_service.update_job(job_id, {
                "status": "COMPLETE",
                "progress": 100,
                "result": {"message": "No data sources to sync"},
            })
            return

        # Start and track ingestion job for each data source
        synced = 0
        failed = 0
        ingestion_summaries: list[dict] = []
        for ds in data_sources:
            ds_id = ds["dataSourceId"]
            logger.info("Starting ingestion for KB=%s, DS=%s", settings.BEDROCK_KB_ID, ds_id)

            start_resp = bedrock_agent.start_ingestion_job(
                knowledgeBaseId=settings.BEDROCK_KB_ID,
                dataSourceId=ds_id,
            )

            ingestion_job = start_resp.get("ingestionJob", {})
            ingestion_job_id = ingestion_job.get("ingestionJobId")

            if not ingestion_job_id:
                failed += 1
                ingestion_summaries.append({
                    "data_source_id": ds_id,
                    "status": "FAILED",
                    "error": "Bedrock did not return ingestionJobId",
                })
                continue

            dynamo_service.create_kb_ingestion_record(
                sync_job_id=job_id,
                knowledge_base_id=settings.BEDROCK_KB_ID,
                data_source_id=ds_id,
                ingestion_job_id=ingestion_job_id,
                category=category,
                only_changed=only_changed,
                affected_doc_ids=affected_doc_ids,
            )

            ingestion_final = _wait_for_ingestion_completion(
                bedrock_agent=bedrock_agent,
                knowledge_base_id=settings.BEDROCK_KB_ID,
                data_source_id=ds_id,
                ingestion_job_id=ingestion_job_id,
            )
            final_status = ingestion_final.get("status", "UNKNOWN")
            statistics = ingestion_final.get("statistics", {})
            failure_reasons = ingestion_final.get("failureReasons", [])

            update_payload = {
                "status": final_status,
                "completed_at": _now_iso(),
                "stats": statistics,
            }
            if failure_reasons:
                update_payload["error"] = " | ".join(str(r) for r in failure_reasons)
            dynamo_service.update_kb_ingestion_record(ingestion_job_id, update_payload)

            if final_status == "COMPLETE":
                synced += 1
            else:
                failed += 1

            ingestion_summaries.append({
                "data_source_id": ds_id,
                "ingestion_job_id": ingestion_job_id,
                "status": final_status,
                "stats": statistics,
                "error": " | ".join(str(r) for r in failure_reasons) if failure_reasons else None,
            })

        if failed > 0:
            # Mark affected docs as error if ingestion failed
            for doc in affected_docs:
                doc_id = doc.get("id")
                if not doc_id:
                    continue
                if doc.get("status") == "deleted":
                    continue
                dynamo_service.update_kb_document(doc_id, {
                    "status": "error",
                    "bedrock_sync_pending": True,
                    "last_sync_job_id": job_id,
                })

            dynamo_service.update_job(job_id, {
                "status": "FAILED",
                "progress": 100,
                "error": f"{failed} data source ingestion job(s) failed",
                "result": {
                    "data_sources_synced": synced,
                    "data_sources_failed": failed,
                    "ingestions": ingestion_summaries,
                },
            })
            raise RuntimeError(f"KB sync failed for {failed} data source(s)")

        # Reconcile document states after successful ingestion
        indexed_count = 0
        deleted_count = 0
        for doc in affected_docs:
            doc_id = doc.get("id")
            if not doc_id:
                continue

            if doc.get("status") == "deleted" and purge_deleted:
                dynamo_service.delete_kb_document(doc_id, hard_delete=True)
                deleted_count += 1
                continue

            if doc.get("status") == "unsynced":
                continue

            dynamo_service.update_kb_document(doc_id, {
                "status": "indexed",
                "bedrock_sync_pending": False,
                "last_synced_at": _now_iso(),
                "last_sync_job_id": job_id,
            })
            indexed_count += 1

        # Defensive hard-delete for explicit deletion flow
        if purge_deleted and deleted_doc_id:
            maybe_doc = dynamo_service.get_kb_document(deleted_doc_id)
            if maybe_doc and maybe_doc.get("status") == "deleted":
                dynamo_service.delete_kb_document(deleted_doc_id, hard_delete=True)
                deleted_count += 1

        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {
                "data_sources_synced": synced,
                "indexed_documents": indexed_count,
                "deleted_documents": deleted_count,
                "category": category,
                "only_changed": only_changed,
                "purge_deleted": purge_deleted,
                "ingestions": ingestion_summaries,
            },
        })
        logger.info(
            "KB sync complete: %d data sources synced, %d docs indexed, %d docs deleted",
            synced,
            indexed_count,
            deleted_count,
        )

    except Exception as exc:
        logger.error("KB sync failed: %s", exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        raise
