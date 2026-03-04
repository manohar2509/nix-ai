"""
Strategic Intelligence routes — the 8 killer features:

  POST   /strategic/documents/{doc_id}/council          → Adversarial Council debate (sync, legacy)
  POST   /strategic/documents/{doc_id}/debate            → Start async Boardroom Debate (NEW)
  GET    /strategic/debates/{debate_id}                  → Poll debate status & transcript (NEW)
  GET    /strategic/documents/{doc_id}/debates            → List debates for a document (NEW)
  POST   /strategic/documents/{doc_id}/friction-map      → Strategic Friction Heatmap
  POST   /strategic/documents/{doc_id}/cost-analysis     → Trial Cost Architect
  POST   /strategic/documents/{doc_id}/payer-simulation  → Synthetic Payer Simulator
  POST   /strategic/documents/{doc_id}/submission-strategy → Regulatory Arbitrage / Submission
  POST   /strategic/documents/{doc_id}/optimize          → Protocol Optimizer
  POST   /strategic/documents/{doc_id}/investor-report   → Deal Room / Investor Report
  POST   /strategic/documents/{doc_id}/watchdog          → Compliance Watchdog
  GET    /strategic/documents/{doc_id}/clauses           → Smart Clause Library
  GET    /strategic/portfolio                            → Portfolio Risk Score
  GET    /strategic/cross-protocol                       → Cross-Protocol Intelligence
"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.schemas.strategic import (
    ClauseLibraryResponse,
    CostAnalysisResponse,
    CouncilResponse,
    CrossProtocolResponse,
    DebateStatusResponse,
    FrictionMapResponse,
    InvestorReportResponse,
    PayerSimulationResponse,
    PortfolioRiskResponse,
    ProtocolOptimizationResponse,
    StartDebateRequest,
    StartDebateResponse,
    SubmissionStrategyResponse,
    WatchdogResponse,
)
from app.core.auth import CurrentUser, get_current_user
from app.core.config import get_settings
from app.services import dynamo_service, sqs_service, strategic_service

import logging
import threading

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/strategic", tags=["strategic-intelligence"])


# ── 1. Adversarial Council (sync — legacy) ──────────────────────
@router.post("/documents/{doc_id}/council", response_model=CouncilResponse)
async def run_council(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Launch multi-agent adversarial debate on a protocol (synchronous)."""
    result = strategic_service.run_adversarial_council(doc_id)
    return CouncilResponse(**result)


# ── 1b. Async Boardroom Debate (NEW — recommended) ─────────────
@router.post("/documents/{doc_id}/debate", response_model=StartDebateResponse)
async def start_debate(
    doc_id: str,
    body: StartDebateRequest = StartDebateRequest(),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Start an asynchronous Adversarial Boardroom debate.

    This kicks off a multi-agent debate in the background via SQS.
    The debate runs for 30-60 seconds. Poll GET /debates/{debate_id}
    to watch the debate unfold in real-time.
    """
    # Validate document exists
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Validate document has content (needs s3_key at minimum)
    if not doc.get("s3_key"):
        raise HTTPException(
            status_code=400,
            detail="Document has no uploaded file. Please upload a protocol document first.",
        )

    # Create job record
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="RUN_BOARDROOM_DEBATE",
        params={"document_id": doc_id, "max_rounds": body.max_rounds},
    )

    # Create debate record
    debate = dynamo_service.create_debate(
        user_id=user.user_id,
        doc_id=doc_id,
        job_id=job["id"],
    )

    # Queue the debate task — or run locally in background thread
    settings = get_settings()
    if settings.is_lambda:
        # Production: queue via SQS → Worker Lambda
        sqs_service.send_boardroom_debate_task(
            job_id=job["id"],
            debate_id=debate["id"],
            doc_id=doc_id,
            user_id=user.user_id,
            max_rounds=body.max_rounds,
        )
    else:
        # Local dev: run the debate in a background thread
        # (No Worker Lambda running locally to consume SQS)
        _debate_id = debate["id"]
        _job_id = job["id"]
        _user_id = user.user_id
        _max_rounds = body.max_rounds

        def _run_local_debate():
            try:
                from worker.tasks.boardroom_debate import process_boardroom_debate
                process_boardroom_debate({
                    "task": "RUN_BOARDROOM_DEBATE",
                    "job_id": _job_id,
                    "debate_id": _debate_id,
                    "doc_id": doc_id,
                    "user_id": _user_id,
                    "max_rounds": _max_rounds,
                })
            except Exception as exc:
                logger.error("Local debate thread failed: %s", exc)
                try:
                    dynamo_service.update_debate(_debate_id, {
                        "status": "FAILED",
                        "error": f"Local execution failed: {str(exc)[:400]}",
                    })
                    dynamo_service.update_job(_job_id, {
                        "status": "FAILED",
                        "error": str(exc)[:400],
                    })
                except Exception:
                    pass

        thread = threading.Thread(target=_run_local_debate, daemon=True)
        thread.start()
        logger.info(
            "Local dev: debate %s running in background thread (no SQS)",
            debate["id"],
        )

    return StartDebateResponse(
        debate_id=debate["id"],
        job_id=job["id"],
        status="QUEUED",
        message="Adversarial Boardroom debate initiated. Poll GET /strategic/debates/{debate_id} for real-time updates.",
    )


@router.get("/debates/{debate_id}", response_model=DebateStatusResponse)
async def get_debate_status(
    debate_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Poll the status and transcript of an ongoing debate.

    Returns the full transcript so far. New turns appear as agents speak.
    Frontend should poll every 2-3 seconds until status is COMPLETED.
    """
    debate = dynamo_service.get_debate(debate_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    if debate.get("user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this debate")

    return DebateStatusResponse(
        debate_id=debate["id"],
        status=debate.get("status", "QUEUED"),
        progress=debate.get("progress", 0),
        protocol_name=debate.get("protocol_name", ""),
        scores=debate.get("scores", {}),
        current_round=debate.get("current_round", 0),
        total_rounds=debate.get("total_rounds", 0),
        current_topic=debate.get("current_topic", ""),
        transcript=debate.get("transcript", []),
        final_verdict=debate.get("final_verdict"),
        total_turns=debate.get("total_turns", 0),
        rounds_completed=debate.get("rounds_completed", 0),
        elapsed_seconds=debate.get("elapsed_seconds", 0),
        error=debate.get("error"),
        created_at=debate.get("created_at"),
        updated_at=debate.get("updated_at"),
        completed_at=debate.get("completed_at"),
    )


@router.get("/documents/{doc_id}/debates")
async def list_debates(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """List all debates for a document (most recent first)."""
    debates = dynamo_service.get_debates_for_document(doc_id, user.user_id)
    debates.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return {
        "debates": [
            {
                "debate_id": d["id"],
                "status": d.get("status", "QUEUED"),
                "progress": d.get("progress", 0),
                "rounds_completed": d.get("rounds_completed", 0),
                "created_at": d.get("created_at"),
                "completed_at": d.get("completed_at"),
            }
            for d in debates
        ],
        "total": len(debates),
    }


# ── 2. Friction Heatmap ─────────────────────────────────────────
@router.post("/documents/{doc_id}/friction-map", response_model=FrictionMapResponse)
async def get_friction_map(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Generate section-by-section regulatory vs commercial friction map."""
    result = strategic_service.generate_friction_map(doc_id)
    return FrictionMapResponse(**result)


# ── 3. Trial Cost Architect ─────────────────────────────────────
@router.post("/documents/{doc_id}/cost-analysis", response_model=CostAnalysisResponse)
async def get_cost_analysis(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Estimate trial costs and per-finding cost impacts."""
    result = strategic_service.analyze_trial_costs(doc_id)
    return CostAnalysisResponse(**result)


# ── 4. Synthetic Payer Simulator ────────────────────────────────
@router.post("/documents/{doc_id}/payer-simulation", response_model=PayerSimulationResponse)
async def simulate_payer(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Predict insurer and HTA body coverage decisions."""
    result = strategic_service.simulate_payer_decisions(doc_id)
    return PayerSimulationResponse(**result)


# ── 5. Submission Strategy ──────────────────────────────────────
@router.post("/documents/{doc_id}/submission-strategy", response_model=SubmissionStrategyResponse)
async def get_submission_strategy(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Optimize global submission order and generate golden protocol changes."""
    result = strategic_service.generate_submission_strategy(doc_id)
    return SubmissionStrategyResponse(**result)


# ── 6. Protocol Optimizer ───────────────────────────────────────
@router.post("/documents/{doc_id}/optimize", response_model=ProtocolOptimizationResponse)
async def optimize(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Generate specific protocol text rewrites to resolve findings."""
    result = strategic_service.optimize_protocol(doc_id)
    return ProtocolOptimizationResponse(**result)


# ── 7. Deal Room / Investor Report ──────────────────────────────
@router.post("/documents/{doc_id}/investor-report", response_model=InvestorReportResponse)
async def get_investor_report(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Generate VC/investor due diligence package."""
    result = strategic_service.generate_investor_report(doc_id)
    return InvestorReportResponse(**result)


# ── 8. Compliance Watchdog ──────────────────────────────────────
@router.post("/documents/{doc_id}/watchdog", response_model=WatchdogResponse)
async def run_watchdog(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Scan protocol against recent regulatory updates."""
    result = strategic_service.run_compliance_watchdog(doc_id)
    return WatchdogResponse(**result)


# ── Smart Clause Library ────────────────────────────────────────
@router.get("/documents/{doc_id}/clauses", response_model=ClauseLibraryResponse)
async def get_clauses(
    doc_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Extract suggested regulatory clauses from analysis findings."""
    result = strategic_service.get_smart_clauses(doc_id)
    return ClauseLibraryResponse(**result)


# ── Portfolio Risk ──────────────────────────────────────────────
@router.get("/portfolio", response_model=PortfolioRiskResponse)
async def get_portfolio(
    user: CurrentUser = Depends(get_current_user),
):
    """Aggregate risk scores across all user protocols."""
    result = strategic_service.get_portfolio_risk(user.user_id)
    return PortfolioRiskResponse(**result)


# ── Cross-Protocol Intelligence ─────────────────────────────────
@router.get("/cross-protocol", response_model=CrossProtocolResponse)
async def get_cross_protocol(
    user: CurrentUser = Depends(get_current_user),
):
    """Find patterns across all analyzed protocols."""
    result = strategic_service.get_cross_protocol_intelligence()
    return CrossProtocolResponse(**result)
