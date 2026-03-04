"""
NIX AI — Boardroom State (The Memory)

Defines the shared state for the LangGraph Supervisor architecture.
This is what the "Virtual Boardroom" remembers across agent turns.

Uses TypedDict with Annotated reducers so LangGraph can merge
partial state updates from each agent node automatically.
"""

from __future__ import annotations

import operator
from typing import Annotated, Optional, TypedDict


class AgentMessage(TypedDict, total=False):
    """A single message in the debate transcript."""
    agent: str          # "Regulator", "Payer", "Patient", "Supervisor"
    role: str           # Display role e.g. "Dr. No (The Regulator)"
    content: str        # The actual argument text
    tool_calls: list    # Tools the agent invoked (for transparency)
    tool_results: list  # Results from tool invocations
    round_number: int   # Which round of the debate
    timestamp: str      # ISO timestamp


class BoardroomState(TypedDict, total=False):
    """
    The full state of an Adversarial Boardroom debate session.

    LangGraph uses the Annotated[..., operator.add] pattern to automatically
    append new messages from each agent node to the existing list, rather
    than replacing it.
    """
    # ── Core Debate Context ──
    # The messages exchanged in the debate (appended by each agent)
    messages: Annotated[list[dict], operator.add]

    # The full text of the protocol being analyzed
    protocol_text: str

    # Extracted analysis findings (grounding data for agents)
    analysis_findings: str

    # Payer gap data
    payer_gaps: str

    # Jurisdiction scores
    jurisdiction_data: str

    # Current analysis scores
    regulator_score: int
    payer_score: int
    global_readiness_score: int

    # Protocol name
    protocol_name: str

    # ── Orchestration ──
    # The ID of the debate (for DB updates + frontend polling)
    debate_id: str

    # The document ID being debated
    doc_id: str

    # The user who initiated the debate
    user_id: str

    # Who speaks next? Set by Supervisor.
    next_speaker: str

    # Current round number
    current_round: int

    # Max rounds allowed
    max_rounds: int

    # Track who has spoken in the current round
    spoken_this_round: Annotated[list[str], operator.add]

    # ── Accumulated Results ──
    # Final verdict (set when debate concludes)
    final_verdict: Optional[dict]

    # Errors encountered during the debate
    errors: Annotated[list[str], operator.add]
