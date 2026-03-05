"""
Regulatory Intelligence routes — all new REQ-1 through REQ-10 endpoints:

  GET    /regulatory/guidelines              → ICH guideline database (REQ-1)
  GET    /documents/{doc_id}/jurisdiction     → Jurisdiction compass scores (REQ-2)
  POST   /documents/{doc_id}/simulate        → Trigger amendment simulation (REQ-3)
  GET    /documents/{doc_id}/simulations     → List simulations (REQ-3)
  GET    /documents/{doc_id}/timeline        → Risk timeline events (REQ-4)
  GET    /documents/{doc_id}/payer-gaps      → Payer evidence gaps (REQ-5)
  POST   /compare                            → Compare protocols (REQ-6)
  GET    /comparisons                        → List comparisons (REQ-6)
  GET    /comparisons/{cmp_id}               → Get comparison result (REQ-6)
  POST   /documents/{doc_id}/report          → Generate readiness report (REQ-8)
  GET    /documents/{doc_id}/benchmark       → Benchmark against trials (REQ-10)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.schemas.analysis import (
    CompareProtocolsRequest,
    ComparisonJobResponse,
    ReportRequest,
    SimulateAmendmentRequest,
    SimulationJobResponse,
)
from app.core.auth import CurrentUser, get_current_user
from app.core.exceptions import NixAIException
from app.services import analysis_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/regulatory", tags=["regulatory"])


# ── REQ-1: ICH Guideline Database ───────────────────────────────
@router.get("/guidelines")
async def get_guidelines():
    """Return the full ICH guideline reference database."""
    try:
        return {"guidelines": analysis_service.get_ich_guidelines()}
    except Exception as exc:
        logger.error("Get guidelines failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to get guidelines: {str(exc)[:200]}")


# ── REQ-2: Jurisdiction Compass ─────────────────────────────────
@router.get("/documents/{doc_id}/jurisdiction")
async def get_jurisdiction_scores(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get per-jurisdiction regulatory compliance scores from the latest analysis."""
    try:
        result = analysis_service.get_analysis_results(user, doc_id)
        return {
            "jurisdiction_scores": result.get("jurisdiction_scores", []),
            "global_readiness_score": result.get("global_readiness_score", 0),
        }
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get jurisdiction scores failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get jurisdiction scores: {str(exc)[:200]}")


# ── REQ-3: Amendment Simulation ─────────────────────────────────
@router.post("/documents/{doc_id}/simulate", response_model=SimulationJobResponse)
async def trigger_simulation(
    doc_id: str,
    body: SimulateAmendmentRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Trigger a what-if amendment simulation."""
    try:
        return analysis_service.trigger_simulation(user, doc_id, body.amendment_text)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Trigger simulation failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to trigger simulation: {str(exc)[:200]}")


@router.get("/documents/{doc_id}/simulations")
async def list_simulations(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """List all amendment simulations for a document."""
    try:
        return {"simulations": analysis_service.get_simulations(user, doc_id)}
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("List simulations failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to list simulations: {str(exc)[:200]}")


# ── REQ-4: Risk Timeline ────────────────────────────────────────
@router.get("/documents/{doc_id}/timeline")
async def get_timeline(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get the regulatory risk timeline for a document."""
    try:
        return {"events": analysis_service.get_timeline(user, doc_id)}
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get timeline failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get timeline: {str(exc)[:200]}")


# ── REQ-5: Payer Evidence Gaps ──────────────────────────────────
@router.get("/documents/{doc_id}/payer-gaps")
async def get_payer_gaps(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get HTA/payer evidence gaps from the latest analysis."""
    try:
        result = analysis_service.get_analysis_results(user, doc_id)
        return {
            "payer_gaps": result.get("payer_gaps", []),
            "hta_body_scores": result.get("hta_body_scores", {}),
            "payerScore": result.get("payerScore", 0),
        }
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get payer gaps failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get payer gaps: {str(exc)[:200]}")


# ── REQ-6: Protocol Comparison ──────────────────────────────────
@router.post("/compare", response_model=ComparisonJobResponse)
async def trigger_comparison(
    body: CompareProtocolsRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Compare multiple protocols."""
    try:
        return analysis_service.trigger_comparison(user, body.document_ids)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Trigger comparison failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to trigger comparison: {str(exc)[:200]}")


@router.get("/comparisons")
async def list_comparisons(
    user: CurrentUser = Depends(get_current_user),
):
    """List all protocol comparisons."""
    try:
        return {"comparisons": analysis_service.get_comparisons(user)}
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("List comparisons failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to list comparisons: {str(exc)[:200]}")


@router.get("/comparisons/{cmp_id}")
async def get_comparison(
    cmp_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Get a single comparison result."""
    try:
        return analysis_service.get_comparison_result(user, cmp_id)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get comparison failed for %s: %s", cmp_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get comparison: {str(exc)[:200]}")


# ── REQ-8: Submission Readiness Report ──────────────────────────
@router.post("/documents/{doc_id}/report")
async def generate_report(
    doc_id: str,
    body: ReportRequest = ReportRequest(),
    user: CurrentUser = Depends(get_current_user),
):
    """Generate a comprehensive submission readiness report."""
    try:
        return analysis_service.generate_report(user, doc_id, sections=body.sections)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Generate report failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(exc)[:200]}")


# ── REQ-10: Benchmarking ────────────────────────────────────────
@router.get("/documents/{doc_id}/benchmark")
async def get_benchmark(
    doc_id: str,
    indication: str = Query("", description="Therapeutic indication (e.g. 'breast cancer')"),
    phase: str = Query("", description="Trial phase (1, 2, 3, 4)"),
    user: CurrentUser = Depends(get_current_user),
):
    """Benchmark protocol against ClinicalTrials.gov data."""
    try:
        return analysis_service.get_benchmark(user, doc_id, indication=indication, phase=phase)
    except NixAIException:
        raise
    except Exception as exc:
        logger.error("Get benchmark failed for doc %s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to get benchmark: {str(exc)[:200]}")
