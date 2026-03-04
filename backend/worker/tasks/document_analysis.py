"""
Worker Task — Document Analysis

Reads a document from S3 and sends it to Bedrock for regulatory + payer
analysis. Uses a 3-tier approach:

  1. Native DocumentBlock — sends raw PDF bytes directly to Bedrock
     (model reads layout, tables, images natively — best quality)
  2. Text fallback — if document is too large or unsupported format,
     extracts text with pypdf and sends as text prompt
  3. Textract enrichment (optional) — extracts tables/forms as
     structured JSON for additional analysis context

Stores structured results in DynamoDB.
"""

from __future__ import annotations

import logging
import time

from app.core.config import get_settings
from app.services import bedrock_service, dynamo_service, s3_service

logger = logging.getLogger(__name__)


def process_document_analysis(payload: dict) -> None:
    """
    Process a document analysis task.

    Payload:
        job_id: str
        doc_id: str
        s3_key: str
        user_id: str
    """
    job_id = payload["job_id"]
    doc_id = payload["doc_id"]
    s3_key = payload["s3_key"]
    preferences = payload.get("preferences")  # User analysis preferences from ConfigurationView

    start_time = time.time()

    # ── Idempotency guard: skip if job was already completed/failed/cancelled ──
    existing_job = dynamo_service.get_job(job_id)
    if existing_job and existing_job.get("status") in ("COMPLETE", "FAILED", "CANCELLED"):
        logger.info(
            "Skipping job %s — already in terminal state: %s",
            job_id, existing_job["status"],
        )
        return

    # ── Check document still exists (may have been deleted while queued) ──
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        logger.warning("Document %s no longer exists, marking job %s as CANCELLED", doc_id, job_id)
        dynamo_service.update_job(job_id, {
            "status": "CANCELLED",
            "error": "Document was deleted before analysis started",
        })
        return

    # Mark job as IN_PROGRESS
    dynamo_service.update_job(job_id, {
        "status": "IN_PROGRESS",
        "progress": 10,
        "current_step": "Reading document from storage...",
    })

    try:
        # 1. Read raw document bytes from S3
        logger.info("Reading document bytes from S3: %s", s3_key)
        document_bytes = s3_service.get_object_bytes(s3_key)
        if not document_bytes:
            raise ValueError(f"Document not found in S3: {s3_key}")

        filename = s3_key.rsplit("/", 1)[-1] if "/" in s3_key else s3_key

        dynamo_service.update_job(job_id, {
            "progress": 20,
            "current_step": "Analyzing document with AI...",
        })

        # 2. Try native DocumentBlock analysis first (best quality)
        analysis_result = None
        extraction_method = "unknown"

        logger.info(
            "Attempting native document analysis: %s (%d bytes)",
            filename, len(document_bytes),
        )

        try:
            analysis_result = bedrock_service.analyze_document_native(
                document_bytes=document_bytes,
                filename=filename,
                preferences=preferences,
            )
        except Exception as exc:
            logger.warning(
                "Native document analysis failed for %s, will try text fallback: %s",
                filename, exc,
            )

        # 3. Fallback: extract text and use text-based analysis
        if analysis_result is None:
            logger.info("Falling back to text-based analysis for %s", filename)

            dynamo_service.update_job(job_id, {
                "progress": 30,
                "current_step": "Extracting text from document...",
            })

            document_text = s3_service.extract_text_from_s3_object(s3_key)
            if not document_text:
                raise ValueError(
                    f"Could not extract text from {s3_key}. "
                    f"The file may be a scanned/image PDF without extractable text."
                )

            dynamo_service.update_job(job_id, {
                "progress": 50,
                "current_step": "Analyzing regulatory compliance (text mode)...",
            })

            analysis_result = bedrock_service.analyze_document(document_text, preferences=preferences)
            extraction_method = "text_fallback"
        else:
            extraction_method = "native_document_block"

        dynamo_service.update_job(job_id, {
            "progress": 75,
            "current_step": "Extracting structured data...",
        })

        # 4. Optional: Textract enrichment for table data
        textract_data = None
        settings = get_settings()
        if getattr(settings, "TEXTRACT_ENABLED", False):
            try:
                textract_data = bedrock_service.extract_tables_with_textract(
                    document_bytes=document_bytes,
                    filename=filename,
                )
                logger.info(
                    "Textract enrichment: %d tables, %d key-value pairs",
                    len(textract_data.get("tables", [])),
                    len(textract_data.get("key_values", [])),
                )
            except Exception as exc:
                logger.warning("Textract enrichment failed (non-blocking): %s", exc)

        dynamo_service.update_job(job_id, {
            "progress": 85,
            "current_step": "Saving analysis results...",
        })

        # 5. Sanitise scores — Bedrock returns Python floats which
        #    DynamoDB rejects ("Float types are not supported").
        #    Round to 1 decimal place to preserve precision.
        reg_score = round(float(analysis_result.get("regulatorScore", 0) or 0), 1)
        pay_score = round(float(analysis_result.get("payerScore", 0) or 0), 1)
        findings  = analysis_result.get("findings", []) or []
        summary   = str(analysis_result.get("summary", "") or "")
        tables_n  = int(analysis_result.get("tables_detected", 0) or 0)

        # 5a. Enhanced regulatory intelligence fields (REQ-1 through REQ-7)
        jurisdiction_scores = analysis_result.get("jurisdiction_scores", []) or []
        global_readiness    = round(float(analysis_result.get("global_readiness_score", 0) or 0), 1)
        payer_gaps          = analysis_result.get("payer_gaps", []) or []
        hta_body_scores     = analysis_result.get("hta_body_scores", {}) or {}

        # 5b. Enrich findings with ICH guideline URLs
        from app.services.regulatory_engine import enrich_guideline_urls
        findings = enrich_guideline_urls(findings)

        # 5c. Find the analysis record and update it
        analysis = dynamo_service.get_analysis_for_document(doc_id)
        if analysis:
            update_data = {
                "status": "COMPLETE",
                "regulator_score": reg_score,
                "payer_score": pay_score,
                "findings": findings,
                "summary": summary,
                "extraction_method": extraction_method,
                "jurisdiction_scores": jurisdiction_scores,
                "global_readiness_score": global_readiness,
                "payer_gaps": payer_gaps,
                "hta_body_scores": hta_body_scores,
            }
            # Attach Textract data if available
            if textract_data and textract_data.get("tables"):
                update_data["tables"] = textract_data["tables"]
                update_data["key_values"] = textract_data.get("key_values", [])

            dynamo_service.update_analysis(doc_id, analysis["id"], update_data)

        # 6. Update document status
        dynamo_service.update_document(doc_id, {"status": "analyzed"})

        # 7. Mark job as COMPLETE
        duration_s = round(time.time() - start_time, 2)
        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {
                "regulator_score": reg_score,
                "payer_score": pay_score,
                "findings_count": len(findings),
                "tables_detected": tables_n,
                "extraction_method": extraction_method,
                "duration": str(duration_s),
                "model_id": settings.BEDROCK_MODEL_ID,
            },
        })

        logger.info(
            "Document analysis complete: job=%s, doc=%s, method=%s, duration=%.1fs",
            job_id, doc_id, extraction_method, duration_s,
        )

    except Exception as exc:
        logger.error("Document analysis failed for job %s: %s", job_id, exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        dynamo_service.update_document(doc_id, {"status": "error"})
        raise
