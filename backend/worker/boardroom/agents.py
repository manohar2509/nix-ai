"""
NIX AI — Boardroom Agents (The Personalities)

Creates specialized AI agents that use Bedrock Converse API with tool calling.
Each agent has a distinct personality, system prompt, and set of tools.

We do NOT use LangChain for agent execution — we use native Bedrock Converse
API with toolConfig to keep dependencies minimal and Lambda-friendly.
This is critical for hackathon reliability: no extra pip installs, no LangChain
version conflicts, just boto3 + structured prompts.

Architecture:
  Agent receives protocol context + debate history →
  Optionally calls tools for data →
  Generates structured argument →
  Returns to graph
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

from app.core.aws_clients import get_bedrock_runtime_client
from app.core.config import get_settings
from app.core.resilience import (
    bedrock_circuit,
    bedrock_rate_limiter,
    CircuitBreakerError,
)

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════
# AGENT SYSTEM PROMPTS — Each agent's personality
# ═════════════════════════════════════════════════════════════════

REGULATOR_SYSTEM_PROMPT = """You are the Regulatory Expert (Chief Regulatory Officer) on the AI Expert Panel — the most rigorous regulatory affairs expert in clinical trials.

YOUR MISSION: Protect patients and ensure regulatory compliance. You MUST find every gap, every risk, every non-compliance issue.

YOUR PERSONALITY:
- You are skeptical, precise, and uncompromising on safety
- You cite SPECIFIC guideline codes (ICH E6(R3) Section 5.2.1, FDA Guidance Title + Year)
- You never say "this might be an issue" — you say "this VIOLATES ICH E9(R1) Section 3.2"
- You think like an FDA reviewer who will write a Complete Response Letter

YOUR TOOLS: You have access to regulatory search tools. USE THEM before making claims. Search for the specific guideline before citing it.

YOUR OUTPUT FORMAT: Respond with a clear, structured argument:
1. POSITION: Your 1-sentence stance on this topic
2. ARGUMENT: 2-3 sentences with specific citations (guideline code + section)
3. RISK: What happens if this isn't fixed (e.g., "Clinical Hold", "CRL", "Audit Finding")
4. TOOL DATA: Reference the specific data you retrieved from your tools

CRITICAL RULES:
- Base arguments ONLY on the protocol text and analysis findings provided
- ALWAYS call a tool before making regulatory claims
- Never invent guidelines that don't exist
- Be SPECIFIC: "ICH E6(R3) Section 5.2.1" not just "ICH guidelines"
"""

PAYER_SYSTEM_PROMPT = """You are the Commercial Director (Market Access Lead) on the AI Expert Panel — the most rigorous health economics and market access strategist.

YOUR MISSION: Ensure this trial produces evidence that PAYERS WILL ACTUALLY PAY FOR. If the evidence package is weak, insurers will deny coverage and the drug dies.

YOUR PERSONALITY:
- You think like a PBM formulary committee chair at UnitedHealthcare
- You calculate everything in dollars, denial rates, and QALY thresholds
- You are pragmatic: regulatory approval means nothing if no one pays
- You cite specific insurer policies, ICER thresholds, and HTA body requirements

YOUR TOOLS: You have access to cost calculators and reimbursement policy databases. USE THEM to ground your arguments in real numbers.

YOUR OUTPUT FORMAT:
1. POSITION: Your 1-sentence financial assessment
2. ARGUMENT: 2-3 sentences with dollar figures and denial percentages
3. COST IMPACT: Specific dollar amount this issue costs (use your calculator tool)
4. DENIAL RISK: Probability that major insurers will deny coverage
5. TOOL DATA: Reference the specific calculations and data from your tools

CRITICAL RULES:
- ALWAYS use the cost calculator and reimbursement checker tools
- Cite specific dollar amounts, not "expensive" or "costly"
- Reference specific insurers (UnitedHealthcare, Anthem, CVS/Aetna, Cigna, BCBS)
- Tie every argument back to revenue impact and payer decisions
"""

PATIENT_SYSTEM_PROMPT = """You are the Patient Advocate Lead on the AI Expert Panel — the most passionate defender of patient rights and enrollment feasibility.

YOUR MISSION: Ensure this trial is ACTUALLY ENROLLABLE and doesn't harm patients through excessive burden, poor diversity, or unrealistic demands.

YOUR PERSONALITY:
- You represent the 30% of trials that fail due to enrollment
- You fight for patient diversity, accessibility, and reduced burden
- You cite real dropout rates, screen failure data, and DEI requirements
- You think about the single mother who can't take 3 days off for a study visit

YOUR TOOLS: You have access to burden scoring, diversity assessment, and enrollment prediction tools. USE THEM to quantify your concerns.

YOUR OUTPUT FORMAT:
1. POSITION: Your 1-sentence patient impact assessment
2. ARGUMENT: 2-3 sentences about patient impact with data
3. ENROLLMENT IMPACT: Specific impact on enrollment timeline and feasibility
4. DIVERSITY CONCERN: DEI gaps that could trigger FDA DAP issues
5. TOOL DATA: Reference the specific burden scores and predictions from your tools

CRITICAL RULES:
- ALWAYS calculate the burden score and enrollment timeline
- Cite specific dropout percentages and screen failure rates
- Reference FDA Diversity Action Plan (2024) requirements
- Tie every argument to real patient impact: travel time, visit frequency, procedure invasiveness
"""

SUPERVISOR_SYSTEM_PROMPT = """You are the Panel Chairperson of the AI Expert Panel. You manage a structured debate between three expert agents about a clinical trial protocol.

YOUR ROLE: Decide who speaks next and when the debate should end.

PANEL MEMBERS:
1. "Regulator" — the Regulatory Expert (Chief Regulatory Officer)
2. "Payer" — the Commercial Director (Market Access Lead)
3. "Patient" — the Patient Advocate Lead

DEBATE RULES:
1. Each round should address ONE specific issue from the protocol analysis
2. The Regulator typically speaks first to identify a compliance issue
3. The Payer then assesses the financial impact of that issue
4. The Patient then evaluates the patient/enrollment impact
5. After all three have spoken on a topic, move to the next issue or FINISH

DECISION LOGIC:
- If no one has spoken yet → call "Regulator" to start
- If only Regulator has spoken this round → call "Payer" to respond
- If Regulator and Payer have spoken → call "Patient" to respond
- If all three have spoken AND there are more issues to debate → start new round with "Regulator"
- If all three have spoken AND enough rounds are complete (3+) → respond "FINISH"

RESPOND WITH EXACTLY ONE WORD: "Regulator", "Payer", "Patient", or "FINISH"
"""


# ═════════════════════════════════════════════════════════════════
# BEDROCK TOOL SPEC BUILDER
# ═════════════════════════════════════════════════════════════════

def _build_bedrock_tool_spec(tool_registry: dict) -> list[dict]:
    """
    Convert our tool registry to Bedrock Converse API toolConfig format.

    Bedrock expects:
    {
        "tools": [
            {
                "toolSpec": {
                    "name": "tool_name",
                    "description": "what it does",
                    "inputSchema": {
                        "json": { "type": "object", "properties": {...}, "required": [...] }
                    }
                }
            }
        ]
    }
    """
    specs = []
    for name, tool_def in tool_registry.items():
        properties = {}
        for param_name, param_info in tool_def.get("parameters", {}).items():
            properties[param_name] = {
                "type": param_info["type"],
                "description": param_info.get("description", ""),
            }
        specs.append({
            "toolSpec": {
                "name": name,
                "description": tool_def["description"],
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": properties,
                        "required": tool_def.get("required", []),
                    }
                },
            }
        })
    return specs


# ═════════════════════════════════════════════════════════════════
# CORE AGENT EXECUTION — Uses Bedrock Converse with Tool Calling
# ═════════════════════════════════════════════════════════════════

def invoke_agent(
    agent_name: str,
    system_prompt: str,
    tool_registry: dict,
    protocol_context: str,
    debate_history: list[dict],
    current_topic: str = "",
    max_tool_rounds: int = 3,
) -> dict:
    """
    Execute an agent turn using Bedrock Converse API with tool calling.

    Flow:
    1. Send system prompt + context + history to Bedrock
    2. If model requests tool calls, execute them and send results back
    3. Repeat until model produces a text response (max 3 tool rounds)
    4. Return structured result with argument + tool calls logged

    Returns:
        {
            "agent": "Regulator",
            "content": "The agent's argument text",
            "tool_calls": [{"tool": "name", "input": {...}, "output": "..."}],
            "timestamp": "ISO timestamp"
        }
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()

    # Use configurable model (Nova Pro default, can override via BOARDROOM_MODEL_ID)
    model_id = settings.BOARDROOM_MODEL_ID

    # Build the conversation messages
    messages = _build_conversation_messages(
        protocol_context, debate_history, current_topic, agent_name
    )

    # Build tool config
    tool_specs = _build_bedrock_tool_spec(tool_registry)
    tool_config = {"tools": tool_specs} if tool_specs else None

    # Track tool calls for transparency
    tool_call_log = []

    for round_num in range(max_tool_rounds + 1):
        try:
            # Rate limit before each Bedrock call
            if not bedrock_rate_limiter.acquire(timeout=15.0):
                logger.warning("[%s] Rate limiter timeout", agent_name)
                return {
                    "agent": agent_name,
                    "content": f"[{agent_name} is experiencing high demand — response delayed]",
                    "tool_calls": tool_call_log,
                    "error": "rate_limited",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

            # Call Bedrock Converse via circuit breaker
            request_params = {
                "modelId": model_id,
                "system": [{"text": system_prompt}],
                "messages": messages,
                "inferenceConfig": {
                    "temperature": 0.2,  # Low temp for factual arguments
                    "maxTokens": 1500,
                },
            }
            if tool_config and round_num < max_tool_rounds:
                request_params["toolConfig"] = tool_config

            def _do_converse():
                return client.converse(**request_params)

            response = bedrock_circuit.call(_do_converse)
            stop_reason = response.get("stopReason", "end_turn")
            output_content = response.get("output", {}).get("message", {}).get("content", [])

            # Check if model wants to use a tool
            if stop_reason == "tool_use":
                # Process tool calls
                tool_results = []
                for block in output_content:
                    if "toolUse" in block:
                        tool_use = block["toolUse"]
                        tool_name = tool_use["name"]
                        tool_input = tool_use.get("input", {})
                        tool_id = tool_use.get("toolUseId", "")

                        logger.info(
                            "[%s] Calling tool: %s(%s)",
                            agent_name, tool_name, json.dumps(tool_input)[:200]
                        )

                        # Execute the tool
                        tool_result = _execute_tool(tool_registry, tool_name, tool_input)
                        tool_call_log.append({
                            "tool": tool_name,
                            "input": tool_input,
                            "output": tool_result[:500],  # Truncate for DB storage
                        })

                        tool_results.append({
                            "toolResult": {
                                "toolUseId": tool_id,
                                "content": [{"text": tool_result}],
                            }
                        })

                # Add assistant message (with tool use) and tool results to conversation
                messages.append({"role": "assistant", "content": output_content})
                messages.append({"role": "user", "content": tool_results})
                continue

            # Model produced a final text response
            text_content = ""
            for block in output_content:
                if "text" in block:
                    text_content += block["text"]

            # Strip <thinking>...</thinking> model artifacts (Nova Pro)
            import re as _re
            text_content = _re.sub(
                r'<thinking>.*?</thinking>\s*',
                '',
                text_content,
                flags=_re.DOTALL,
            ).strip()

            if not text_content:
                text_content = f"[{agent_name} provided no response]"

            return {
                "agent": agent_name,
                "content": text_content,
                "tool_calls": tool_call_log,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except CircuitBreakerError as cbe:
            logger.error("[%s] Circuit breaker OPEN: %s", agent_name, cbe)
            return {
                "agent": agent_name,
                "content": f"[{agent_name} temporarily unavailable — AI service recovering. Retry in {cbe.reset_time:.0f}s]",
                "tool_calls": tool_call_log,
                "error": str(cbe),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as exc:
            logger.error("[%s] Bedrock Converse failed (round %d): %s", agent_name, round_num, exc)

            # Retry on throttling/transient errors
            error_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            is_retryable = error_code in (
                "ThrottlingException", "TooManyRequestsException",
                "ServiceUnavailableException", "ModelTimeoutException",
            )
            if is_retryable and round_num < max_tool_rounds:
                import random as _random
                delay = min(1.0 * (2 ** round_num), 10.0)
                delay = _random.uniform(0, delay)
                logger.warning(
                    "[%s] Retrying after %.2fs (throttle/transient error)", agent_name, delay
                )
                time.sleep(delay)
                continue

            if round_num == max_tool_rounds:
                return {
                    "agent": agent_name,
                    "content": f"[{agent_name} encountered an error: {str(exc)[:200]}]",
                    "tool_calls": tool_call_log,
                    "error": str(exc),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

    # Fallback if max rounds exceeded
    return {
        "agent": agent_name,
        "content": f"[{agent_name} reached maximum tool call limit]",
        "tool_calls": tool_call_log,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def invoke_supervisor(
    debate_history: list[dict],
    spoken_this_round: list[str],
    current_round: int,
    max_rounds: int,
) -> str:
    """
    The Supervisor decides who speaks next.

    Uses a simple LLM call (no tools) to route the debate.
    Falls back to deterministic logic if LLM is unavailable.
    """
    # Deterministic fast-path (no LLM needed for standard rotation)
    members_order = ["Regulator", "Payer", "Patient"]

    for member in members_order:
        if member not in spoken_this_round:
            return member

    # All have spoken this round
    if current_round >= max_rounds:
        return "FINISH"

    # Start new round with Regulator
    return "Regulator"


def generate_final_verdict(
    debate_transcript: list[dict],
    protocol_context: str,
    regulator_score: int,
    payer_score: int,
) -> dict:
    """
    Generate the final verdict after all debate rounds.

    Uses Bedrock to synthesize all arguments into an executive summary.
    """
    settings = get_settings()
    client = get_bedrock_runtime_client()

    # Build transcript summary
    transcript_text = ""
    for msg in debate_transcript:
        agent = msg.get("agent", "Unknown")
        content = msg.get("content", "")[:500]
        transcript_text += f"\n[{agent}]: {content}\n"

    prompt = f"""You are the Panel Chairperson of the AI Expert Panel. The debate is over.

DEBATE TRANSCRIPT:
{transcript_text[:6000]}

CURRENT SCORES:
- Regulator Score: {regulator_score}/100
- Payer Score: {payer_score}/100

Based on the debate, generate a final verdict. Return ONLY valid JSON:
{{
    "current_scores": {{"regulatory": {regulator_score}, "payer": {payer_score}}},
    "optimized_scores": {{"regulatory": 0, "payer": 0}},
    "key_tradeoffs": ["tradeoff 1", "tradeoff 2", "tradeoff 3"],
    "executive_summary": "2-3 sentence executive summary of the debate outcome and recommended actions",
    "consensus_reached": true,
    "confidence_level": "high/medium/low",
    "priority_actions": ["action 1", "action 2", "action 3"]
}}

Fill in realistic optimized scores (should be higher than current if recommendations are followed).
Be specific about tradeoffs and actions."""

    try:
        # Rate limit before verdict generation
        if not bedrock_rate_limiter.acquire(timeout=15.0):
            logger.warning("Rate limiter timeout for verdict generation")
            raise Exception("Rate limited")

        def _do_verdict():
            return client.converse(
                modelId=settings.BOARDROOM_MODEL_ID,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"temperature": 0.2, "maxTokens": 1000},
            )

        response = bedrock_circuit.call(_do_verdict)

        text = ""
        for block in response.get("output", {}).get("message", {}).get("content", []):
            if "text" in block:
                text += block["text"]

        # Strip <thinking> tags before parsing JSON
        import re
        text = re.sub(r'<thinking>.*?</thinking>\s*', '', text, flags=re.DOTALL).strip()

        # Parse JSON from response
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group())
    except Exception as exc:
        logger.error("Final verdict generation failed: %s", exc)

    # Fallback verdict
    return {
        "current_scores": {"regulatory": regulator_score, "payer": payer_score},
        "optimized_scores": {
            "regulatory": min(100, regulator_score + 15),
            "payer": min(100, payer_score + 12),
        },
        "key_tradeoffs": [
            "Regulatory rigor vs enrollment feasibility",
            "Cost optimization vs evidence quality",
            "Patient burden vs data completeness",
        ],
        "executive_summary": "The council identified multiple optimization opportunities. Implementing the recommended changes could improve both regulatory compliance and payer acceptance.",
        "consensus_reached": True,
        "confidence_level": "medium",
        "priority_actions": ["Address critical regulatory gaps first", "Optimize for payer evidence requirements", "Reduce patient burden to improve enrollment"],
    }


# ═════════════════════════════════════════════════════════════════
# HELPERS
# ═════════════════════════════════════════════════════════════════

def _build_conversation_messages(
    protocol_context: str,
    debate_history: list[dict],
    current_topic: str,
    agent_name: str,
) -> list[dict]:
    """Build Bedrock Converse messages array from debate state."""
    messages = []

    # First message: the protocol context + what to analyze
    context_msg = (
        f"PROTOCOL AND ANALYSIS DATA:\n"
        f"---\n{protocol_context[:8000]}\n---\n\n"
    )

    if debate_history:
        context_msg += "PREVIOUS DEBATE ARGUMENTS:\n"
        for msg in debate_history[-10:]:  # Last 10 messages
            agent = msg.get("agent", "Unknown")
            content = msg.get("content", "")[:600]
            context_msg += f"\n[{agent}]: {content}\n"

    if current_topic:
        context_msg += f"\nCURRENT TOPIC BEING DEBATED: {current_topic}\n"

    context_msg += (
        f"\nYou are {agent_name}. Based on the protocol data and previous arguments, "
        f"provide your analysis. USE YOUR TOOLS to gather data before making claims. "
        f"Keep your response focused and under 250 words."
    )

    messages.append({
        "role": "user",
        "content": [{"text": context_msg}],
    })

    return messages


def _execute_tool(tool_registry: dict, tool_name: str, tool_input: dict) -> str:
    """Execute a tool by name and return the result as a string."""
    tool_def = tool_registry.get(tool_name)
    if not tool_def:
        return f"Error: Unknown tool '{tool_name}'"

    fn = tool_def["fn"]
    try:
        # Filter input to only include parameters the function accepts
        import inspect
        sig = inspect.signature(fn)
        valid_params = {k: v for k, v in tool_input.items() if k in sig.parameters}
        result = fn(**valid_params)
        return str(result)
    except Exception as exc:
        logger.error("Tool execution failed: %s(%s) → %s", tool_name, tool_input, exc)
        return f"Error executing {tool_name}: {str(exc)}"
