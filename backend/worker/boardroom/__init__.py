"""
NIX AI — Adversarial Boardroom (LangGraph Supervisor Architecture)

A multi-agent debate system where independent AI agents with specialized
tools analyze clinical trial protocols from regulatory, payer, and patient
perspectives. The Supervisor orchestrates the debate and DynamoDB is updated
in real-time so the frontend can animate the debate bubble-by-bubble.

Architecture:
  ┌──────────────┐
  │  Supervisor   │  ← decides who speaks next
  │  (Chairman)   │
  └──────┬───────┘
         │ routes to
    ┌────┴────┬─────────┐
    ▼         ▼         ▼
 ┌──────┐ ┌──────┐ ┌──────┐
 │Reg.  │ │Payer │ │Pat.  │
 │Agent │ │Agent │ │Agent │
 └──┬───┘ └──┬───┘ └──┬───┘
    │        │        │
  Tools    Tools    Tools
  (FDA KB) (Cost)  (Burden)

Each agent speaks → writes to DynamoDB → returns to Supervisor.
Frontend polls DynamoDB to animate debate in real-time.
"""
