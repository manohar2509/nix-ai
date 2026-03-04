"""Quick import validation for all boardroom modules."""
import sys
errors = []

try:
    from app.api.routes.strategic import router
    print("OK strategic routes")
except Exception as e:
    errors.append(f"strategic routes: {e}")
    print(f"FAIL strategic routes: {e}")

try:
    from worker.boardroom.state import BoardroomState, AgentMessage
    print("OK boardroom state")
except Exception as e:
    errors.append(f"boardroom state: {e}")
    print(f"FAIL boardroom state: {e}")

try:
    from worker.boardroom.tools import ALL_TOOLS, REGULATOR_TOOLS, PAYER_TOOLS, PATIENT_TOOLS
    print(f"OK boardroom tools ({len(ALL_TOOLS)} total)")
except Exception as e:
    errors.append(f"boardroom tools: {e}")
    print(f"FAIL boardroom tools: {e}")

try:
    from worker.boardroom.agents import invoke_agent, invoke_supervisor, generate_final_verdict
    print("OK boardroom agents")
except Exception as e:
    errors.append(f"boardroom agents: {e}")
    print(f"FAIL boardroom agents: {e}")

try:
    from worker.boardroom.graph import run_boardroom_debate, AGENTS
    print("OK boardroom graph")
except Exception as e:
    errors.append(f"boardroom graph: {e}")
    print(f"FAIL boardroom graph: {e}")

try:
    from worker.tasks.boardroom_debate import process_boardroom_debate
    print("OK boardroom task handler")
except Exception as e:
    errors.append(f"boardroom task: {e}")
    print(f"FAIL boardroom task: {e}")

try:
    from app.services.dynamo_service import create_debate, get_debate, update_debate, append_debate_transcript_turn
    print("OK dynamo_service debate functions")
except Exception as e:
    errors.append(f"dynamo_service: {e}")
    print(f"FAIL dynamo_service: {e}")

try:
    from app.services.sqs_service import send_boardroom_debate_task
    print("OK sqs_service boardroom function")
except Exception as e:
    errors.append(f"sqs_service: {e}")
    print(f"FAIL sqs_service: {e}")

try:
    from app.api.schemas.strategic import StartDebateRequest, StartDebateResponse, DebateStatusResponse
    print("OK strategic schemas")
except Exception as e:
    errors.append(f"schemas: {e}")
    print(f"FAIL schemas: {e}")

try:
    from app.core.config import get_settings
    s = get_settings()
    print(f"OK config (BOARDROOM_MODEL_ID={s.BOARDROOM_MODEL_ID})")
except Exception as e:
    errors.append(f"config: {e}")
    print(f"FAIL config: {e}")

print()
if errors:
    print(f"FAILED: {len(errors)} error(s)")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("All imports successful!")
    sys.exit(0)
