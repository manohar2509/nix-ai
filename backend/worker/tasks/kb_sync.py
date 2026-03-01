"""
Worker Task — Knowledge Base Sync

Triggers a sync of the Bedrock Knowledge Base data source so newly
uploaded documents are indexed and searchable via RAG.
"""

from __future__ import annotations

import logging
import time

from app.core.aws_clients import get_bedrock_agent_admin_client
from app.core.config import get_settings
from app.services import dynamo_service

logger = logging.getLogger(__name__)


def process_kb_sync(payload: dict) -> None:
    """
    Trigger a Bedrock Knowledge Base data source sync.

    Payload:
        job_id: str
        user_id: str
    """
    job_id = payload["job_id"]
    settings = get_settings()

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

        # Start ingestion job for each data source
        synced = 0
        for ds in data_sources:
            ds_id = ds["dataSourceId"]
            logger.info("Starting ingestion for KB=%s, DS=%s", settings.BEDROCK_KB_ID, ds_id)

            bedrock_agent.start_ingestion_job(
                knowledgeBaseId=settings.BEDROCK_KB_ID,
                dataSourceId=ds_id,
            )
            synced += 1

        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {"data_sources_synced": synced},
        })
        logger.info("KB sync complete: %d data sources synced", synced)

    except Exception as exc:
        logger.error("KB sync failed: %s", exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        raise
