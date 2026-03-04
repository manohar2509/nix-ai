"""
End-to-End Integration Test for the Adversarial Boardroom.

Tests the FULL debate pipeline:
  1. Upload a test protocol document (presigned URL → S3 PUT → register)
  2. Run analysis (creates findings for the debate to reference)
  3. Start async debate
  4. Poll until complete
  5. Validate the full transcript + verdict

Requires:
  - Backend running on http://localhost:8000
  - Valid AWS credentials (for DynamoDB, S3, Bedrock)
  - .env configured

Usage:
  cd backend && source venv/bin/activate
  python test_boardroom_e2e.py
"""

import json
import sys
import time

import requests

BASE = "http://localhost:8000"
HEADERS = {}  # Dev mode uses mock user — no auth needed


def step(msg):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")


def main():
    # ── Step 1: Upload a test protocol ──
    step("1. Upload test protocol document")

    # Read a test protocol file
    test_file = "../test_protocols/phase3_oncology_protocol.txt"
    try:
        with open(test_file, "r") as f:
            protocol_text = f.read()
        print(f"  Loaded {len(protocol_text)} chars from {test_file}")
    except FileNotFoundError:
        print(f"  Test file {test_file} not found, using inline sample")
        protocol_text = """
CLINICAL TRIAL PROTOCOL: ONCO-2025-PD1
Phase 3, Randomized, Double-Blind, Placebo-Controlled Study
Evaluating Novel PD-1 Inhibitor NIX-101 in Advanced Non-Small Cell Lung Cancer

STUDY DESIGN:
- Phase: 3
- Design: Randomized 2:1, double-blind, placebo-controlled
- Population: Adults aged 18-75 with advanced NSCLC (Stage IIIB/IV)
- Sample Size: 450 patients (300 NIX-101, 150 placebo)
- Primary Endpoint: Progression-Free Survival (PFS)
- Secondary Endpoints: Overall Survival (OS), Objective Response Rate (ORR)
- Duration: 24 months treatment, 36 months follow-up

INCLUSION CRITERIA:
- Age 18-75 years
- Histologically confirmed NSCLC, Stage IIIB or IV
- ECOG performance status 0-1
- Measurable disease per RECIST 1.1
- Adequate organ function

EXCLUSION CRITERIA:
- Prior PD-1/PD-L1 therapy
- Active autoimmune disease
- Untreated brain metastases

STUDY VISITS:
- Screening (Day -28 to -1): 2 visits
- Treatment Phase: Every 3 weeks for 24 months (approximately 35 visits)
- Follow-up: Every 12 weeks for 36 months (13 visits)
- Total estimated visits: 50

SAFETY:
- DSMB review every 6 months
- Interim analysis at 50% events
- SAE reporting within 24 hours

STATISTICAL ANALYSIS:
- Primary analysis: Log-rank test, stratified by PD-L1 expression
- Sample size based on HR=0.70, 80% power, alpha=0.025 (one-sided)
"""

    filename = "onco_pd1_phase3.txt"

    # Step 1a: Get presigned upload URL  (GET /upload-url?filename=...&contentType=...)
    resp = requests.get(
        f"{BASE}/upload-url",
        params={"filename": filename, "contentType": "text/plain"},
        headers=HEADERS,
    )
    if resp.status_code != 200:
        print(f"  FAIL: GET /upload-url returned {resp.status_code}: {resp.text}")
        sys.exit(1)
    upload_data = resp.json()
    s3_key = upload_data["key"]  # API returns "key", not "s3_key"
    presigned_url = upload_data["url"]
    print(f"  Presigned URL obtained. S3 key: {s3_key}")

    # Step 1b: Upload file to S3 via presigned PUT URL
    put_resp = requests.put(
        presigned_url,
        data=protocol_text.encode("utf-8"),
        headers={"Content-Type": "text/plain"},
    )
    if put_resp.status_code not in (200, 204):
        print(f"  FAIL: S3 PUT returned {put_resp.status_code}: {put_resp.text[:300]}")
        sys.exit(1)
    print(f"  Uploaded to S3 successfully")

    # Step 1c: Register document in DB  (POST /documents)
    resp = requests.post(
        f"{BASE}/documents",
        json={
            "name": filename,
            "s3_key": s3_key,
            "size": len(protocol_text),
        },
        headers=HEADERS,
    )
    if resp.status_code != 200:
        print(f"  FAIL: POST /documents returned {resp.status_code}: {resp.text}")
        sys.exit(1)
    doc = resp.json()
    doc_id = doc["id"]
    print(f"  Document registered: {doc_id}")

    # ── Step 2: Run analysis (creates findings for debate) ──
    step("2. Run document analysis")

    # POST /analyze  with {"document_id": doc_id}
    resp = requests.post(
        f"{BASE}/analyze",
        json={"document_id": doc_id},
        headers=HEADERS,
    )
    if resp.status_code != 200:
        print(f"  FAIL: POST /analyze returned {resp.status_code}: {resp.text}")
        sys.exit(1)
    job = resp.json()
    job_id = job.get("jobId", "")
    print(f"  Analysis started: job={job_id}")

    # Poll for analysis completion (local dev runs inline, should be instant-ish)
    analysis_status = "analyzing"
    print("  Waiting for analysis to complete...")
    for i in range(90):
        time.sleep(2)
        resp = requests.get(f"{BASE}/documents/{doc_id}", headers=HEADERS)
        if resp.status_code == 200:
            doc_data = resp.json()
            analysis_status = doc_data.get("status", "")
            if analysis_status in ("analyzed", "ANALYZED", "COMPLETE"):
                print(f"  ✓ Analysis complete!")
                break
            if analysis_status in ("error", "FAILED"):
                print(f"  Analysis FAILED. Continuing with debate anyway (uses default topics)...")
                break
        if i % 10 == 0:
            print(f"    ... waiting ({i*2}s, status={analysis_status})")
    else:
        print("  Analysis timed out (180s). Proceeding with debate anyway.")

    # ── Step 3: Start async boardroom debate ──
    step("3. Start Adversarial Boardroom Debate")
    resp = requests.post(
        f"{BASE}/strategic/documents/{doc_id}/debate",
        json={"max_rounds": 2},  # 2 rounds for faster testing
        headers=HEADERS,
    )
    if resp.status_code != 200:
        print(f"  FAIL: start debate returned {resp.status_code}: {resp.text}")
        sys.exit(1)
    debate_data = resp.json()
    debate_id = debate_data["debate_id"]
    print(f"  Debate started!")
    print(f"    debate_id: {debate_id}")
    print(f"    job_id: {debate_data['job_id']}")
    print(f"    status: {debate_data['status']}")

    # ── Step 4: Poll for debate updates ──
    step("4. Polling for real-time debate updates")
    prev_turns = 0
    start_time = time.time()
    final_status = None

    for poll_num in range(120):  # Max 5 minutes
        time.sleep(2.5)
        resp = requests.get(
            f"{BASE}/strategic/debates/{debate_id}",
            headers=HEADERS,
        )
        if resp.status_code != 200:
            print(f"  Poll {poll_num}: HTTP {resp.status_code}")
            continue

        status = resp.json()
        transcript = status.get("transcript", [])
        current_status = status.get("status", "UNKNOWN")
        progress = status.get("progress", 0)

        # Print new turns
        for i in range(prev_turns, len(transcript)):
            turn = transcript[i]
            agent = turn.get("agent", "?")
            role = turn.get("role", "")
            content = turn.get("content", "")[:120]
            tools = len(turn.get("tool_calls", []))
            rn = turn.get("round_number", 0)

            tool_str = f" [{tools} tools]" if tools > 0 else ""
            print(f"  R{rn} | {agent:12s} | {content}...{tool_str}")

        prev_turns = len(transcript)

        if current_status in ("COMPLETED", "FAILED"):
            final_status = status
            elapsed = time.time() - start_time
            print(f"\n  Status: {current_status} ({elapsed:.1f}s)")
            break

        if poll_num % 4 == 0:
            print(f"  ... polling ({progress}% complete, {len(transcript)} turns)")

    if not final_status:
        print("  TIMEOUT: Debate did not complete within 5 minutes")
        sys.exit(1)

    # ── Step 5: Validate results ──
    step("5. Validate Debate Results")

    if final_status.get("status") == "FAILED":
        print(f"  DEBATE FAILED: {final_status.get('error', 'unknown')}")
        sys.exit(1)

    transcript = final_status.get("transcript", [])
    verdict = final_status.get("final_verdict", {})

    print(f"  Total turns: {len(transcript)}")
    print(f"  Rounds completed: {final_status.get('rounds_completed', 0)}")
    print(f"  Elapsed: {final_status.get('elapsed_seconds', 0):.1f}s")

    # Validate structure
    checks = {
        "Has transcript": len(transcript) > 0,
        "Has Chairman opening": any(t.get("agent") == "Chairman" and t.get("round_number") == 0 for t in transcript),
        "Has Regulator turns": any(t.get("agent") == "Regulator" for t in transcript),
        "Has Payer turns": any(t.get("agent") == "Payer" for t in transcript),
        "Has Patient turns": any(t.get("agent") == "Patient" for t in transcript),
        "Has tool calls": any(len(t.get("tool_calls", [])) > 0 for t in transcript),
        "Has final verdict": bool(verdict),
        "Verdict has executive_summary": bool(verdict.get("executive_summary")),
        "Verdict has priority_actions": bool(verdict.get("priority_actions")),
        "Verdict has key_tradeoffs": bool(verdict.get("key_tradeoffs")),
        "Verdict has scores": bool(verdict.get("current_scores") or verdict.get("optimized_scores")),
        "Scores present": bool(final_status.get("scores")),
    }

    all_pass = True
    for name, passed in checks.items():
        status_icon = "✓" if passed else "✗"
        print(f"  {status_icon} {name}")
        if not passed:
            all_pass = False

    # Print verdict summary
    step("VERDICT SUMMARY")
    print(f"  Executive Summary: {verdict.get('executive_summary', 'N/A')[:200]}")
    print(f"  Confidence: {verdict.get('confidence_level', 'N/A')}")
    print(f"  Consensus: {verdict.get('consensus_reached', 'N/A')}")
    if verdict.get("priority_actions"):
        print(f"  Priority Actions:")
        for action in verdict["priority_actions"][:3]:
            print(f"    → {action}")

    # Print tool call summary
    total_tools = sum(len(t.get("tool_calls", [])) for t in transcript)
    tool_names = set()
    for t in transcript:
        for tc in t.get("tool_calls", []):
            tool_names.add(tc.get("tool", "?"))
    print(f"\n  Total tool calls: {total_tools}")
    print(f"  Unique tools used: {', '.join(sorted(tool_names)) if tool_names else 'none'}")

    # ── Final result ──
    step("RESULT")
    if all_pass:
        print("  ✅ ALL CHECKS PASSED — Boardroom debate is production-ready!")
        sys.exit(0)
    else:
        print("  ⚠️  Some checks failed — review output above")
        sys.exit(1)


if __name__ == "__main__":
    main()
