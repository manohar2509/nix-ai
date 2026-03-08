"""
NIX AI — Boardroom Graph (The Orchestrator)

This is the central nervous system of the Adversarial Boardroom.
It implements the LangGraph Supervisor pattern WITHOUT requiring
the langgraph pip package — we implement the state graph loop manually
to keep Lambda dependencies minimal.

Flow:
  1. API creates a DEBATE record in DynamoDB (status: IN_PROGRESS)
  2. SQS triggers the Worker Lambda
  3. This graph runs the debate loop:
     a. Supervisor decides who speaks next
     b. Agent runs with tools, produces argument
     c. Argument is written to DynamoDB immediately (for frontend polling)
     d. Loop back to Supervisor
     e. After 3 rounds or FINISH signal → generate verdict
  4. Mark debate as COMPLETED in DynamoDB

The frontend polls the DEBATE record and animates each turn as it appears.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from app.services import dynamo_service, s3_service
from app.services.regulatory_engine import ALL_REFERENCES_PROMPT_BLOCK
from worker.boardroom.agents import (
    invoke_agent,
    invoke_supervisor,
    generate_final_verdict,
    REGULATOR_SYSTEM_PROMPT,
    PAYER_SYSTEM_PROMPT,
    PATIENT_SYSTEM_PROMPT,
)
from worker.boardroom.tools import (
    REGULATOR_TOOLS,
    PAYER_TOOLS,
    PATIENT_TOOLS,
)


logger = logging.getLogger(__name__)

# Agent configurations
AGENTS = {
    "Regulator": {
        "display_name": "Regulatory Expert",
        "role": "Chief Regulatory Officer",
        "system_prompt": REGULATOR_SYSTEM_PROMPT,
        "tools": REGULATOR_TOOLS,
        "icon": "shield",
        "color": "red",
    },
    "Payer": {
        "display_name": "Commercial Director",
        "role": "Market Access Lead",
        "system_prompt": PAYER_SYSTEM_PROMPT,
        "tools": PAYER_TOOLS,
        "icon": "dollar-sign",
        "color": "amber",
    },
    "Patient": {
        "display_name": "Patient Advocate",
        "role": "Patient & Community Lead",
        "system_prompt": PATIENT_SYSTEM_PROMPT,
        "tools": PATIENT_TOOLS,
        "icon": "heart",
        "color": "emerald",
    },
}


# ═════════════════════════════════════════════════════════════════
# PROTOCOL CONTEXT BUILDER
# ═════════════════════════════════════════════════════════════════

def _build_protocol_context(doc_id: str) -> dict:
    """
    Build the complete context for agents from the document and analysis.

    Returns a dict with all the grounding data agents need.
    """
    # Fetch document
    doc = dynamo_service.get_document(doc_id)
    if not doc:
        raise ValueError(f"Document {doc_id} not found")

    # Fetch protocol text from S3
    s3_key = doc.get("s3_key", "")
    doc_text = ""
    if s3_key:
        try:
            doc_text = s3_service.extract_text_from_s3_object(s3_key)
        except Exception as exc:
            logger.warning("Could not extract text from %s: %s", s3_key, exc)

    # Fetch existing analysis
    analysis = dynamo_service.get_analysis_for_document(doc_id) or {}

    findings = analysis.get("findings", [])
    payer_gaps = analysis.get("payer_gaps", [])
    jurisdiction_scores = analysis.get("jurisdiction_scores", [])

    # Build the comprehensive context string
    context_parts = []

    context_parts.append(f"PROTOCOL NAME: {doc.get('name', 'Unknown Protocol')}")
    context_parts.append(f"\nPROTOCOL TEXT (excerpt):\n---\n{doc_text[:6000]}\n---")

    context_parts.append("\nANALYSIS SCORES:")
    context_parts.append(f"  Regulator Score: {analysis.get('regulator_score', 0)}/100")
    context_parts.append(f"  Payer Score: {analysis.get('payer_score', 0)}/100")
    context_parts.append(f"  Global Readiness: {analysis.get('global_readiness_score', 0)}/100")

    if findings:
        context_parts.append(f"\nANALYSIS FINDINGS ({len(findings)} total):")
        for f in findings[:10]:
            context_parts.append(
                f"  [{f.get('id', '?')}] {f.get('severity', '?').upper()}: "
                f"{f.get('title', '?')} — {f.get('description', '')[:200]}"
            )

    if payer_gaps:
        context_parts.append(f"\nPAYER GAPS ({len(payer_gaps)} total):")
        for g in payer_gaps[:5]:
            context_parts.append(
                f"  - {g.get('title', '?')}: {g.get('description', '')[:200]}"
            )

    if jurisdiction_scores:
        context_parts.append("\nJURISDICTION COMPLIANCE:")
        for j in jurisdiction_scores[:5]:
            context_parts.append(
                f"  - {j.get('jurisdiction', '?')}: {j.get('score', 0)}/100"
            )

    if analysis.get("summary"):
        context_parts.append(f"\nANALYSIS SUMMARY: {analysis['summary'][:500]}")

    context_parts.append(f"\nREGULATORY REFERENCE DATABASE:\n{ALL_REFERENCES_PROMPT_BLOCK[:2000]}")

    return {
        "context_text": "\n".join(context_parts),
        "doc_name": doc.get("name", "Unknown Protocol"),
        "regulator_score": analysis.get("regulator_score", 0),
        "payer_score": analysis.get("payer_score", 0),
        "global_readiness_score": analysis.get("global_readiness_score", 0),
        "findings": findings,
        "payer_gaps": payer_gaps,
    }


# ═════════════════════════════════════════════════════════════════
# THE GRAPH: Main Debate Execution Loop
# ═════════════════════════════════════════════════════════════════

def run_boardroom_debate(
    debate_id: str,
    doc_id: str,
    user_id: str,
    max_rounds: int = 3,
) -> dict:
    """
    Execute the full Adversarial Boardroom debate.

    This is the main entry point called by the Worker task handler.
    It implements the LangGraph Supervisor pattern as a simple loop:

    while not FINISH:
        next_speaker = supervisor(state)
        if next_speaker == FINISH: break
        result = agent[next_speaker].invoke(state)
        write_to_dynamodb(result)  # Real-time UI update
        state.messages.append(result)

    Returns the complete debate result.
    """
    start_time = time.time()
    logger.info("Starting boardroom debate %s for doc %s", debate_id, doc_id)

    # ── Step 1: Build protocol context ──
    try:
        ctx = _build_protocol_context(doc_id)
    except Exception as exc:
        logger.error("Failed to build protocol context: %s", exc)
        dynamo_service.update_debate(debate_id, {
            "status": "FAILED",
            "error": f"Could not load protocol: {str(exc)}",
        })
        return {"error": str(exc)}

    # ── Step 2: Update debate status to IN_PROGRESS ──
    dynamo_service.update_debate(debate_id, {
        "status": "IN_PROGRESS",
        "protocol_name": ctx["doc_name"],
        "scores": {
            "regulator": ctx["regulator_score"],
            "payer": ctx["payer_score"],
            "global_readiness": ctx["global_readiness_score"],
        },
    })

    # ── Step 3: Extract debate topics from findings ──
    topics = _extract_debate_topics(ctx["findings"], ctx["payer_gaps"])

    # ── Step 4: Run the debate loop ──
    transcript = []
    current_round = 0
    spoken_this_round = []

    try:
        # Append opening announcement
        opening_turn = {
            "agent": "Chairman",
            "role": "Panel Chairperson",
            "content": (
                f"The AI Expert Panel is now in session for protocol: {ctx['doc_name']}. "
                f"Current scores — Regulatory: {ctx['regulator_score']}/100, "
                f"Payer: {ctx['payer_score']}/100. "
                f"We have {len(topics)} issues to debate. Let us begin."
            ),
            "round_number": 0,
            "tool_calls": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        transcript.append(opening_turn)
        dynamo_service.append_debate_transcript_turn(debate_id, opening_turn)

        # Update progress
        dynamo_service.update_debate(debate_id, {
            "current_round": 0,
            "total_rounds": min(max_rounds, len(topics)),
            "progress": 5,
        })

        for round_idx in range(max_rounds):
            current_round = round_idx + 1
            spoken_this_round = []
            topic = topics[round_idx] if round_idx < len(topics) else f"General protocol assessment (Round {current_round})"

            logger.info("Debate %s: Round %d — Topic: %s", debate_id, current_round, topic[:80])

            # Update round info
            dynamo_service.update_debate(debate_id, {
                "current_round": current_round,
                "current_topic": topic,
                "progress": int(10 + (round_idx / max_rounds) * 80),
            })

            # ── Run each agent in order ──
            for agent_name in ["Regulator", "Payer", "Patient"]:
                agent_config = AGENTS[agent_name]

                try:
                    result = invoke_agent(
                        agent_name=agent_name,
                        system_prompt=agent_config["system_prompt"],
                        tool_registry=agent_config["tools"],
                        protocol_context=ctx["context_text"],
                        debate_history=transcript,
                        current_topic=topic,
                    )

                    # Enrich with display metadata
                    result["role"] = f"{agent_config['display_name']} ({agent_config['role']})"
                    result["round_number"] = current_round
                    result["topic"] = topic
                    result["icon"] = agent_config["icon"]
                    result["color"] = agent_config["color"]

                    transcript.append(result)
                    spoken_this_round.append(agent_name)

                    # ── CRITICAL: Write to DynamoDB immediately ──
                    # This is what makes the UI animate in real-time
                    dynamo_service.append_debate_transcript_turn(debate_id, result)

                    logger.info(
                        "Debate %s: %s spoke (%d chars, %d tool calls)",
                        debate_id, agent_name,
                        len(result.get("content", "")),
                        len(result.get("tool_calls", [])),
                    )

                except Exception as exc:
                    logger.error(
                        "Debate %s: %s failed: %s",
                        debate_id, agent_name, exc
                    )
                    error_turn = {
                        "agent": agent_name,
                        "role": f"{agent_config['display_name']} ({agent_config['role']})",
                        "content": f"[{agent_name} encountered a technical issue and could not respond]",
                        "round_number": current_round,
                        "tool_calls": [],
                        "error": str(exc),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    transcript.append(error_turn)
                    dynamo_service.append_debate_transcript_turn(debate_id, error_turn)

            # ── Check if Supervisor says FINISH ──
            supervisor_decision = invoke_supervisor(
                debate_history=transcript,
                spoken_this_round=spoken_this_round,
                current_round=current_round,
                max_rounds=max_rounds,
            )

            if supervisor_decision == "FINISH":
                logger.info("Debate %s: Supervisor called FINISH after round %d", debate_id, current_round)
                break

    except Exception as exc:
        # Catastrophic error in the debate loop — mark as FAILED
        logger.error("Debate %s: Catastrophic failure in debate loop: %s", debate_id, exc, exc_info=True)
        dynamo_service.update_debate(debate_id, {
            "status": "FAILED",
            "error": f"Debate loop failed: {str(exc)[:500]}",
            "rounds_completed": current_round,
            "total_turns": len(transcript),
        })
        return {"error": str(exc), "debate_id": debate_id, "partial_transcript": transcript}

    # ── Step 5: Generate final verdict ──
    dynamo_service.update_debate(debate_id, {"progress": 90, "current_topic": "Generating final verdict..."})

    try:
        verdict = generate_final_verdict(
            debate_transcript=transcript,
            protocol_context=ctx["context_text"],
            regulator_score=ctx["regulator_score"],
            payer_score=ctx["payer_score"],
        )
    except Exception as exc:
        logger.error("Debate %s: Failed to generate verdict: %s", debate_id, exc)
        verdict = {
            "executive_summary": "The debate concluded but verdict generation failed due to a technical error.",
            "error": str(exc),
            "recommendations": [],
        }

    # Append verdict as final turn
    verdict_turn = {
        "agent": "Chairman",
        "role": "Board Chairman — Final Verdict",
        "content": verdict.get("executive_summary", "Debate concluded."),
        "round_number": current_round + 1,
        "tool_calls": [],
        "verdict": verdict,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    transcript.append(verdict_turn)
    dynamo_service.append_debate_transcript_turn(debate_id, verdict_turn)

    # ── Step 6: Mark debate as COMPLETED ──
    elapsed = time.time() - start_time
    dynamo_service.update_debate(debate_id, {
        "status": "COMPLETED",
        "progress": 100,
        "final_verdict": verdict,
        "total_turns": len(transcript),
        "rounds_completed": current_round,
        "elapsed_seconds": round(elapsed, 1),
        # completed_at is set automatically by dynamo_service.update_debate
    })

    logger.info(
        "Debate %s COMPLETED: %d rounds, %d turns, %.1fs elapsed",
        debate_id, current_round, len(transcript), elapsed,
    )

    # ── Build result with both CouncilResponse schema + metadata ──
    result = _build_council_response(transcript, verdict, ctx)
    result["debate_id"] = debate_id
    result["rounds_completed"] = current_round
    result["total_turns"] = len(transcript)
    result["elapsed_seconds"] = round(elapsed, 1)
    result["status"] = "COMPLETED"
    result["scores"] = {
        "regulator": ctx.get("regulator_score", 0),
        "payer": ctx.get("payer_score", 0),
        "global_readiness": ctx.get("global_readiness_score", 0),
    }
    result["protocol_name"] = ctx.get("doc_name", "")

    # ── Persist completed debate into STRATEGIC cache ──
    # This makes the full transcript available via GET /strategic/documents/{doc_id}/cached
    # so the frontend can restore it on page reload without re-running the debate.
    try:
        analysis = ctx.get("analysis", {})
        from app.services.dynamo_service import save_strategic_result
        import hashlib, json
        analysis_hash = hashlib.md5(
            json.dumps({
                "rs": analysis.get("regulator_score", 0),
                "ps": analysis.get("payer_score", 0),
                "fc": len(analysis.get("findings", [])),
            }, sort_keys=True).encode()
        ).hexdigest()[:12]
        save_strategic_result(
            doc_id=doc_id,
            feature_key="council_debate",
            result=result,
            analysis_hash=analysis_hash,
        )
        logger.info("Debate %s persisted to strategic cache for doc %s", debate_id, doc_id)
    except Exception as cache_exc:
        logger.warning("Could not persist debate to strategic cache: %s", cache_exc)

    return result


# ═════════════════════════════════════════════════════════════════
# HELPERS
# ═════════════════════════════════════════════════════════════════

def _extract_debate_topics(findings: list, payer_gaps: list) -> list[str]:
    """
    Extract the most important issues to debate from analysis findings.

    Prioritizes: critical findings > high findings > payer gaps
    """
    topics = []

    # Sort findings by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    sorted_findings = sorted(
        findings,
        key=lambda f: severity_order.get(f.get("severity", "low"), 3),
    )

    for f in sorted_findings[:3]:
        topic = f"{f.get('title', 'Unknown Issue')} (Severity: {f.get('severity', 'unknown').upper()})"
        if f.get("section"):
            topic += f" — Section: {f['section']}"
        topics.append(topic)

    # Add payer gaps as topics if we need more
    for g in payer_gaps[:2]:
        if len(topics) < 3:
            topics.append(f"Payer Gap: {g.get('title', 'Unknown Gap')}")

    # Ensure at least 3 topics
    default_topics = [
        "Overall regulatory compliance and safety assessment",
        "Commercial viability and payer evidence requirements",
        "Patient enrollment feasibility and diversity",
    ]
    while len(topics) < 3:
        topics.append(default_topics[len(topics)])

    return topics[:3]  # Max 3 rounds


def _build_council_response(
    transcript: list[dict],
    verdict: dict,
    ctx: dict,
) -> dict:
    """
    Convert the debate transcript into the CouncilResponse schema format
    that the existing frontend expects.

    This provides backward compatibility — the new async debate system
    produces data that the existing AdversarialCouncil.jsx can render.
    """
    # Group transcript by round
    rounds_data = {}
    for turn in transcript:
        rn = turn.get("round_number", 0)
        if rn == 0 or turn.get("agent") == "Chairman":
            continue
        if rn not in rounds_data:
            rounds_data[rn] = {"topic": turn.get("topic", ""), "agents": {}}
        rounds_data[rn]["agents"][turn.get("agent", "")] = turn

    # Build rounds array
    rounds = []
    for rn in sorted(rounds_data.keys()):
        rd = rounds_data[rn]
        agents = rd["agents"]

        reg = agents.get("Regulator", {})
        pay = agents.get("Payer", {})
        pat = agents.get("Patient", {})

        rounds.append({
            "round_number": rn,
            "topic": rd["topic"],
            "finding_id": None,
            "dr_no": {
                "position": _extract_position(reg.get("content", "")),
                "argument": reg.get("content", ""),
                "guideline_refs": _extract_guideline_refs(reg.get("content", "")),
                "score_impact": {},
                "tool_calls": reg.get("tool_calls", []),
            },
            "the_accountant": {
                "position": _extract_position(pay.get("content", "")),
                "argument": pay.get("content", ""),
                "cost_impact": _extract_cost_mention(pay.get("content", "")),
                "denial_risk": _extract_denial_mention(pay.get("content", "")),
                "score_impact": {},
                "tool_calls": pay.get("tool_calls", []),
            },
            "patient_advocate": {
                "position": _extract_position(pat.get("content", "")),
                "argument": pat.get("content", ""),
                "enrollment_impact": _extract_enrollment_mention(pat.get("content", "")),
                "tool_calls": pat.get("tool_calls", []),
            },
            "mediator": {
                "resolution": _generate_round_resolution(reg, pay, pat),
                "projected_scores": {},
                "implementation": "",
            },
        })

    # Build opening summary
    opening = next(
        (t["content"] for t in transcript if t.get("agent") == "Chairman" and t.get("round_number", 0) == 0),
        f"AI Expert Panel session for: {ctx['doc_name']}",
    )

    return {
        "protocol_name": ctx["doc_name"],
        "opening_summary": opening,
        "rounds": rounds,
        "final_verdict": verdict,
        "debate_id": None,  # Will be set by caller
        "is_async": True,
        "transcript": transcript,
    }


def _extract_position(content: str) -> str:
    """Extract the first sentence as the position statement."""
    if not content:
        return ""
    # Try to find "POSITION:" label
    import re
    pos_match = re.search(r'POSITION:\s*(.+?)(?:\n|$)', content, re.IGNORECASE)
    if pos_match:
        return pos_match.group(1).strip()
    # Fallback: first sentence
    sentences = content.split(". ")
    return (sentences[0] + ".") if sentences else content[:200]


def _extract_guideline_refs(content: str) -> list[str]:
    """Extract ICH/FDA guideline citations from text."""
    import re
    refs = set()
    # Match ICH patterns: ICH E6(R3), ICH E9(R1), etc.
    for match in re.finditer(r'ICH\s+[A-Z]\d+(?:\([A-Z]\d*\))?', content):
        refs.add(match.group())
    # Match FDA patterns
    for match in re.finditer(r'FDA\s+(?:Draft\s+)?(?:Guidance|Final\s+Guidance)\s+[^.]+', content):
        ref = match.group()[:60]
        refs.add(ref)
    return list(refs)[:5]


def _extract_cost_mention(content: str) -> str:
    """Extract dollar amounts from payer arguments."""
    import re
    costs = re.findall(r'\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|M|B|K))?', content)
    return costs[0] if costs else ""


def _extract_denial_mention(content: str) -> str:
    """Extract denial risk percentage from payer arguments."""
    import re
    denials = re.findall(r'(\d+)%\s*(?:denial|deny|denied|rejection)', content, re.IGNORECASE)
    return f"{denials[0]}% denial risk" if denials else ""


def _extract_enrollment_mention(content: str) -> str:
    """Extract enrollment impact from patient arguments."""
    import re
    dropouts = re.findall(r'(\d+)%\s*(?:dropout|drop-out|attrition)', content, re.IGNORECASE)
    if dropouts:
        return f"{dropouts[0]}% predicted dropout rate"
    burden = re.findall(r'[Bb]urden\s+[Ss]core:\s*(\d+)', content)
    if burden:
        return f"Burden Score: {burden[0]}/100"
    return ""


def _generate_round_resolution(reg: dict, pay: dict, pat: dict) -> str:
    """Generate a brief mediator resolution based on the three arguments."""
    # In async mode, the verdict handles this. For backward compat,
    # provide a simple summary.
    parts = []
    if reg.get("content"):
        parts.append("regulatory compliance concerns")
    if pay.get("content"):
        parts.append("commercial viability considerations")
    if pat.get("content"):
        parts.append("patient feasibility factors")

    if parts:
        return (
            f"The mediator recommends balancing {', '.join(parts)}. "
            f"See the final verdict for specific implementation guidance."
        )
    return "Resolution pending final verdict."
