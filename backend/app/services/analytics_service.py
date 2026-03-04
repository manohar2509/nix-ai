"""
NIX AI — Analytics Service

Aggregates data across documents, analyses, and jobs to power:
  - User dashboard (summary, risk, trends, chat usage)
  - Analysis history timeline
  - Admin platform analytics (all users, all data)
  - Admin RAG / KB performance metrics
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict

from app.core.auth import CurrentUser
from app.services import dynamo_service

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
#  USER ANALYTICS — scoped to the authenticated user
# ══════════════════════════════════════════════════════════════════

def get_dashboard(user: CurrentUser) -> dict:
    """
    Enhanced user dashboard with chat usage, score trends,
    and document comparison data.
    """
    user_id = user.user_id

    # ── Fetch raw data ──
    docs = _safe_call(dynamo_service.list_documents, user_id, default=[])
    jobs = _safe_call(dynamo_service.list_jobs, user_id, default=[])

    # Collect analyses + chat stats per document
    analyses = []
    chat_total_convos = 0
    chat_total_msgs = 0
    chat_user_msgs = 0
    chat_assistant_msgs = 0
    chat_total_citations = 0
    most_active_doc = ""
    most_active_doc_msgs = 0
    doc_comparison = []

    for doc in docs:
        doc_id = doc.get("id", "")
        doc_name = doc.get("name", "Unknown")

        # Analysis
        try:
            analysis = dynamo_service.get_analysis_for_document(doc_id)
            if analysis and analysis.get("status") != "QUEUED":
                analyses.append({
                    **analysis,
                    "document_id": doc_id,
                    "document_name": doc_name,
                    "document_size": doc.get("size", 0),
                })
                doc_comparison.append({
                    "documentId": doc_id,
                    "documentName": doc_name,
                    "regulatorScore": _to_float(analysis.get("regulator_score")),
                    "payerScore": _to_float(analysis.get("payer_score")),
                    "findingsCount": len(analysis.get("findings") or []),
                    "status": str(analysis.get("status", "unknown")),
                })
        except Exception as exc:
            logger.error("Analysis fetch failed for doc %s: %s", doc_id, exc)

        # Chat usage
        try:
            chat_stats = dynamo_service.count_chat_messages_for_document(doc_id)
            msg_count = chat_stats.get("total", 0)
            if msg_count > 0:
                chat_total_convos += 1
                chat_total_msgs += msg_count
                chat_user_msgs += chat_stats.get("user_messages", 0)
                chat_assistant_msgs += chat_stats.get("assistant_messages", 0)
                chat_total_citations += chat_stats.get("total_citations", 0)
                if msg_count > most_active_doc_msgs:
                    most_active_doc_msgs = msg_count
                    most_active_doc = doc_name
        except Exception as exc:
            logger.error("Chat stats failed for doc %s: %s", doc_id, exc)

    # ── Summary metrics ──
    total_docs = len(docs)
    total_analyses = len(analyses)
    total_jobs = len(jobs)

    reg_scores = [_to_float(a.get("regulator_score")) for a in analyses if a.get("regulator_score") is not None]
    pay_scores = [_to_float(a.get("payer_score")) for a in analyses if a.get("payer_score") is not None]
    avg_reg = round(sum(reg_scores) / max(len(reg_scores), 1), 1)
    avg_pay = round(sum(pay_scores) / max(len(pay_scores), 1), 1)

    all_findings = _collect_findings(analyses)
    total_findings = len(all_findings)

    # ── Risk distribution ──
    severity_counter = Counter(f.get("severity", "medium") for f in all_findings)
    risk_distribution = {s: severity_counter.get(s, 0) for s in ("critical", "high", "medium", "low")}

    # ── Finding type distribution ──
    type_counter = Counter(f.get("type", "other") for f in all_findings)
    type_distribution = dict(type_counter.most_common(10))

    # ── Score buckets ──
    score_buckets = _build_score_buckets(reg_scores)

    # ── Recent activity ──
    recent_activity = _build_recent_activity(jobs, docs)

    # ── Attention required ──
    attention_required = _build_attention_required(analyses)

    # ── Score trend (chronological) ──
    score_trend = []
    for a in sorted(analyses, key=lambda x: x.get("completed_at") or x.get("created_at") or ""):
        score_trend.append({
            "date": str(a.get("completed_at") or a.get("created_at") or ""),
            "documentName": str(a.get("document_name", "")),
            "regulatorScore": _to_float(a.get("regulator_score")),
            "payerScore": _to_float(a.get("payer_score")),
        })

    # ── Chat usage summary ──
    avg_msgs_per_convo = round(chat_total_msgs / max(chat_total_convos, 1), 1)
    avg_citations = round(chat_total_citations / max(chat_assistant_msgs, 1), 1)

    chat_usage = {
        "totalConversations": chat_total_convos,
        "totalMessages": chat_total_msgs,
        "userMessages": chat_user_msgs,
        "assistantMessages": chat_assistant_msgs,
        "avgMessagesPerConversation": avg_msgs_per_convo,
        "totalCitations": chat_total_citations,
        "avgCitationsPerResponse": avg_citations,
        "mostActiveDocument": most_active_doc,
    }

    return {
        "summary": {
            "totalDocuments": total_docs,
            "totalAnalyses": total_analyses,
            "totalJobs": total_jobs,
            "avgRegulatorScore": avg_reg,
            "avgPayerScore": avg_pay,
            "totalFindings": total_findings,
        },
        "riskDistribution": risk_distribution,
        "typeDistribution": type_distribution,
        "scoreBuckets": score_buckets,
        "recentActivity": recent_activity,
        "attentionRequired": attention_required[:5],
        "chatUsage": chat_usage,
        "scoreTrend": score_trend,
        "documentComparison": doc_comparison,
    }


def get_analysis_history(user: CurrentUser) -> dict:
    """Full analysis history for the current user, newest first."""
    user_id = user.user_id
    docs = _safe_call(dynamo_service.list_documents, user_id, default=[])

    history = []
    for doc in docs:
        try:
            analysis = dynamo_service.get_analysis_for_document(doc["id"])
            if not analysis:
                continue

            findings = _safe_findings(analysis.get("findings"))
            safe_findings = [_sanitise_dict(f) if isinstance(f, dict) else f for f in findings]

            severity_counts = dict(Counter(
                f.get("severity", "medium") if isinstance(f, dict) else "medium"
                for f in safe_findings
            ))
            type_counts = dict(Counter(
                f.get("type", "other") if isinstance(f, dict) else "other"
                for f in safe_findings
            ))

            history.append({
                "id": _str(analysis.get("id")),
                "documentId": _str(doc.get("id")),
                "documentName": _str(doc.get("name", "Unknown")),
                "documentSize": _to_int(doc.get("size")),
                "regulatorScore": _to_float(analysis.get("regulator_score")),
                "payerScore": _to_float(analysis.get("payer_score")),
                "findingsCount": len(safe_findings),
                "severityCounts": severity_counts,
                "typeCounts": type_counts,
                "summary": _str(analysis.get("summary")),
                "findings": safe_findings,
                "analyzedAt": _str(analysis.get("completed_at") or analysis.get("created_at")),
                "status": _str(analysis.get("status", "unknown")),
                "extractionMethod": analysis.get("extraction_method"),
            })
        except Exception as exc:
            logger.error("Analysis history error for doc %s: %s", doc.get("id"), exc)

    history.sort(key=lambda x: x.get("analyzedAt", "") or "", reverse=True)
    return {"analyses": history, "total": len(history)}


# ══════════════════════════════════════════════════════════════════
#  ADMIN ANALYTICS — platform-wide, requires Admin role
# ══════════════════════════════════════════════════════════════════

def get_admin_platform(user: CurrentUser) -> dict:
    """
    Platform-wide metrics for admin dashboard:
    summary, risk, scores, job pipeline, user activity.
    """
    all_docs = _safe_call(dynamo_service.scan_all_documents, default=[])
    all_jobs = _safe_call(dynamo_service.scan_all_jobs, default=[])
    all_analyses = _safe_call(dynamo_service.scan_all_analyses, default=[])

    # ── Unique users ──
    user_ids = set()
    user_doc_count: dict[str, int] = defaultdict(int)
    for d in all_docs:
        uid = d.get("user_id", "")
        if uid:
            user_ids.add(uid)
            user_doc_count[uid] += 1

    # ── Scores & findings ──
    reg_scores = []
    pay_scores = []
    all_findings: list[dict] = []
    doc_analysis_map: dict[str, dict] = {}  # doc_id → analysis

    for a in all_analyses:
        rs = a.get("regulator_score")
        ps = a.get("payer_score")
        if rs is not None:
            try:
                reg_scores.append(float(rs))
            except (TypeError, ValueError):
                pass
        if ps is not None:
            try:
                pay_scores.append(float(ps))
            except (TypeError, ValueError):
                pass
        findings = _safe_findings(a.get("findings"))
        all_findings.extend(f for f in findings if isinstance(f, dict))
        doc_id = a.get("doc_id", "")
        if doc_id:
            doc_analysis_map[doc_id] = a

    avg_reg = round(sum(reg_scores) / max(len(reg_scores), 1), 1)
    avg_pay = round(sum(pay_scores) / max(len(pay_scores), 1), 1)
    total_findings = len(all_findings)

    # ── Risk distribution ──
    sev_counter = Counter(f.get("severity", "medium") for f in all_findings)
    risk_distribution = {s: sev_counter.get(s, 0) for s in ("critical", "high", "medium", "low")}

    # ── Score distribution (histogram) ──
    score_distribution = _build_score_buckets(reg_scores)

    # ── Top finding types ──
    type_counter = Counter(f.get("type", "other") for f in all_findings)
    top_finding_types = [{"type": t, "count": c} for t, c in type_counter.most_common(10)]

    # ── Worst documents (lowest reg score) ──
    worst_docs = []
    for doc in all_docs:
        doc_id = doc.get("id", "")
        analysis = doc_analysis_map.get(doc_id)
        if analysis:
            reg = _to_float(analysis.get("regulator_score"))
            worst_docs.append({
                "documentId": doc_id,
                "documentName": doc.get("name", "Unknown"),
                "userId": doc.get("user_id", ""),
                "regulatorScore": reg,
                "payerScore": _to_float(analysis.get("payer_score")),
                "findingsCount": len(_safe_findings(analysis.get("findings"))),
            })
    worst_docs.sort(key=lambda x: x["regulatorScore"])
    worst_docs = worst_docs[:10]

    # ── Job pipeline metrics ──
    job_pipeline = _build_job_pipeline(all_jobs)

    # ── User activity ──
    user_analysis_count: dict[str, int] = defaultdict(int)
    for doc in all_docs:
        doc_id = doc.get("id", "")
        uid = doc.get("user_id", "")
        if uid and doc_id in doc_analysis_map:
            user_analysis_count[uid] += 1

    user_activity = []
    for uid in user_ids:
        user_activity.append({
            "userId": uid,
            "email": "",
            "documentCount": user_doc_count.get(uid, 0),
            "analysisCount": user_analysis_count.get(uid, 0),
            "chatMessageCount": 0,  # filled below if feasible
        })
    user_activity.sort(key=lambda x: x["documentCount"], reverse=True)
    user_activity = user_activity[:20]

    return {
        "summary": {
            "activeUsers": len(user_ids),
            "totalDocuments": len(all_docs),
            "totalAnalyses": len(all_analyses),
            "totalJobs": len(all_jobs),
            "avgRegulatorScore": avg_reg,
            "avgPayerScore": avg_pay,
            "totalFindings": total_findings,
        },
        "riskDistribution": risk_distribution,
        "scoreDistribution": score_distribution,
        "topFindingTypes": top_finding_types,
        "worstDocuments": worst_docs,
        "jobPipeline": job_pipeline,
        "userActivity": user_activity,
    }


def get_admin_rag(user: CurrentUser) -> dict:
    """
    RAG & Knowledge Base analytics for admins:
    KB health, chat usage, citation quality.
    """
    # ── KB Health ──
    try:
        kb_docs = dynamo_service.list_kb_documents()
    except Exception:
        kb_docs = []

    categories: dict[str, int] = defaultdict(int)
    total_kb_size = 0
    for d in kb_docs:
        categories[d.get("category", "general")] += 1
        total_kb_size += _to_int(d.get("size"))

    last_sync_job = _safe_call(dynamo_service.get_last_kb_sync_job, default=None)
    last_sync_status = "never"
    last_sync_time = ""
    last_sync_job_id = ""
    if last_sync_job:
        last_sync_status = last_sync_job.get("status", "unknown")
        last_sync_time = last_sync_job.get("completed_at") or last_sync_job.get("created_at", "")
        last_sync_job_id = last_sync_job.get("id", "")

    kb_health = {
        "totalKBDocuments": len(kb_docs),
        "totalKBSize": total_kb_size,
        "categories": dict(categories),
        "lastSyncStatus": last_sync_status,
        "lastSyncTime": last_sync_time,
        "lastSyncJobId": last_sync_job_id,
    }

    # ── Chat Metrics (platform-wide) ──
    all_messages = _safe_call(dynamo_service.scan_all_chat_messages, default=[])

    total_msgs = len(all_messages)
    user_msgs = sum(1 for m in all_messages if m.get("role") == "user")
    assistant_msgs = sum(1 for m in all_messages if m.get("role") == "assistant")

    # Unique conversations (unique doc_ids)
    doc_ids_with_chat = set()
    user_ids_chatted = set()
    total_citations = 0
    citation_buckets = {"0": 0, "1-2": 0, "3-5": 0, "6+": 0}

    # Per-day chat activity
    day_counter: dict[str, int] = defaultdict(int)
    # Per-document message count
    doc_msg_counter: dict[str, int] = defaultdict(int)

    for m in all_messages:
        doc_id = m.get("doc_id", "")
        uid = m.get("user_id", "")
        if doc_id:
            doc_ids_with_chat.add(doc_id)
            doc_msg_counter[doc_id] += 1
        if uid:
            user_ids_chatted.add(uid)

        # Citations
        if m.get("role") == "assistant":
            cites = m.get("citations") or []
            if isinstance(cites, list):
                cite_count = len(cites)
                total_citations += cite_count
                if cite_count == 0:
                    citation_buckets["0"] += 1
                elif cite_count <= 2:
                    citation_buckets["1-2"] += 1
                elif cite_count <= 5:
                    citation_buckets["3-5"] += 1
                else:
                    citation_buckets["6+"] += 1

        # Daily activity
        created = m.get("created_at", "")
        if created and len(created) >= 10:
            day_counter[created[:10]] += 1

    total_convos = len(doc_ids_with_chat)
    avg_msgs_per_convo = round(total_msgs / max(total_convos, 1), 1)
    avg_citations = round(total_citations / max(assistant_msgs, 1), 1)

    chat_metrics = {
        "totalConversations": total_convos,
        "totalMessages": total_msgs,
        "userMessages": user_msgs,
        "assistantMessages": assistant_msgs,
        "avgMessagesPerConversation": avg_msgs_per_convo,
        "totalCitations": total_citations,
        "avgCitationsPerResponse": avg_citations,
        "uniqueUsersChattedCount": len(user_ids_chatted),
    }

    # Daily activity sorted
    chat_activity_by_day = sorted(
        [{"date": d, "messages": c} for d, c in day_counter.items()],
        key=lambda x: x["date"],
    )[-30:]  # last 30 days

    # Top documents by chat activity
    top_chat_docs = sorted(
        [{"documentId": did, "messageCount": cnt} for did, cnt in doc_msg_counter.items()],
        key=lambda x: x["messageCount"],
        reverse=True,
    )[:10]

    return {
        "kbHealth": kb_health,
        "chatMetrics": chat_metrics,
        "chatActivityByDay": chat_activity_by_day,
        "topChatDocuments": top_chat_docs,
        "citationDistribution": citation_buckets,
    }


# ══════════════════════════════════════════════════════════════════
#  INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════

def _safe_call(fn, *args, default=None):
    """Call *fn* and return *default* on any error."""
    try:
        return fn(*args)
    except Exception as exc:
        logger.error("Safe call to %s failed: %s", fn.__name__, exc)
        return default


def _to_float(v, default=0.0):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _to_int(v, default=0):
    if v is None:
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _str(v, default=""):
    if v is None:
        return default
    return str(v)


def _safe_findings(raw) -> list:
    if not raw or not isinstance(raw, list):
        return []
    return raw


def _collect_findings(analyses: list[dict]) -> list[dict]:
    findings: list[dict] = []
    for a in analyses:
        raw = a.get("findings") or []
        if isinstance(raw, list):
            findings.extend(f for f in raw if isinstance(f, dict))
    return findings


def _build_score_buckets(scores: list[float]) -> dict:
    buckets = {"0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0}
    for s in scores:
        if s <= 25:
            buckets["0-25"] += 1
        elif s <= 50:
            buckets["26-50"] += 1
        elif s <= 75:
            buckets["51-75"] += 1
        else:
            buckets["76-100"] += 1
    return buckets


def _build_recent_activity(jobs: list[dict], docs: list[dict]) -> list[dict]:
    sorted_jobs = sorted(jobs, key=lambda j: j.get("created_at", ""), reverse=True)
    doc_map = {d["id"]: d.get("name", "") for d in docs}
    recent = []
    for j in sorted_jobs[:10]:
        job_type = j.get("type", "UNKNOWN")
        status = j.get("status", "UNKNOWN")
        doc_id = (j.get("params") or {}).get("document_id", "")
        doc_name = doc_map.get(doc_id, "")
        recent.append({
            "id": j.get("id", ""),
            "type": job_type,
            "status": status,
            "description": _job_description(job_type, status, doc_name),
            "documentName": doc_name,
            "createdAt": j.get("created_at", ""),
            "completedAt": j.get("completed_at", ""),
        })
    return recent


def _build_attention_required(analyses: list[dict]) -> list[dict]:
    items = []
    for a in analyses:
        findings = a.get("findings") or []
        critical = sum(1 for f in findings if isinstance(f, dict) and f.get("severity") == "critical")
        high = sum(1 for f in findings if isinstance(f, dict) and f.get("severity") == "high")
        reg = _to_float(a.get("regulator_score", 100))
        if reg < 50 or critical > 0 or high >= 2:
            items.append({
                "documentId": a.get("document_id", ""),
                "documentName": a.get("document_name", "Unknown"),
                "regulatorScore": reg,
                "payerScore": _to_float(a.get("payer_score")),
                "criticalCount": critical,
                "highCount": high,
                "totalFindings": len(findings),
                "analyzedAt": a.get("completed_at", a.get("created_at", "")),
            })
    items.sort(key=lambda x: (x["criticalCount"], x["highCount"]), reverse=True)
    return items


def _build_job_pipeline(all_jobs: list[dict]) -> dict:
    total = len(all_jobs)
    status_counter = Counter(j.get("status", "UNKNOWN") for j in all_jobs)
    type_counter = Counter(j.get("type", "UNKNOWN") for j in all_jobs)

    success = status_counter.get("COMPLETE", 0)
    failed = status_counter.get("FAILED", 0)
    in_progress = status_counter.get("IN_PROGRESS", 0)
    queued = status_counter.get("QUEUED", 0)

    recent_failures = []
    failed_jobs = [j for j in all_jobs if j.get("status") == "FAILED"]
    failed_jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    for j in failed_jobs[:5]:
        recent_failures.append({
            "id": j.get("id", ""),
            "type": j.get("type", ""),
            "error": j.get("error", "Unknown error"),
            "createdAt": j.get("created_at", ""),
            "userId": j.get("user_id", ""),
        })

    return {
        "totalJobs": total,
        "successCount": success,
        "failureCount": failed,
        "inProgressCount": in_progress,
        "queuedCount": queued,
        "successRate": round(success / max(total, 1) * 100, 1),
        "failureRate": round(failed / max(total, 1) * 100, 1),
        "jobsByType": dict(type_counter),
        "jobsByStatus": dict(status_counter),
        "recentFailures": recent_failures,
    }


def _sanitise_dict(d: dict) -> dict:
    """Recursively convert Decimal → float/int and None → safe defaults."""
    from decimal import Decimal
    clean = {}
    for k, v in d.items():
        if isinstance(v, Decimal):
            clean[k] = int(v) if v == int(v) else float(v)
        elif isinstance(v, dict):
            clean[k] = _sanitise_dict(v)
        elif isinstance(v, list):
            clean[k] = [
                _sanitise_dict(i) if isinstance(i, dict)
                else (int(i) if isinstance(i, Decimal) and i == int(i) else float(i) if isinstance(i, Decimal) else i)
                for i in v
            ]
        else:
            clean[k] = v
    return clean


def _job_description(job_type: str, status: str, doc_name: str) -> str:
    type_labels = {
        "ANALYZE_DOCUMENT": "Document analysis",
        "KB_SYNC": "Knowledge base sync",
        "SYNTHETIC_GENERATION": "Synthetic data generation",
    }
    status_labels = {
        "QUEUED": "queued",
        "IN_PROGRESS": "in progress",
        "COMPLETE": "completed",
        "FAILED": "failed",
    }
    label = type_labels.get(job_type, job_type)
    st = status_labels.get(status, status)
    return f"{label} {st} — {doc_name}" if doc_name else f"{label} {st}"
