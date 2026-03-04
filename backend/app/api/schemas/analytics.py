"""Analytics request / response schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, field_validator


def _safe_int(v, default=0):
    """Coerce to int, handling None / Decimal / float."""
    if v is None:
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _safe_float(v, default=0.0):
    """Coerce to float, handling None / Decimal."""
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _safe_str(v, default=""):
    """Coerce to str, handling None."""
    if v is None:
        return default
    return str(v)


# ── Dashboard ────────────────────────────────────────────────────
class DashboardSummary(BaseModel):
    totalDocuments: int = 0
    totalAnalyses: int = 0
    totalJobs: int = 0
    avgRegulatorScore: float = 0.0
    avgPayerScore: float = 0.0
    totalFindings: int = 0

    model_config = {"coerce_numbers_to_str": False}

    @field_validator("totalDocuments", "totalAnalyses", "totalJobs", "totalFindings", mode="before")
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)

    @field_validator("avgRegulatorScore", "avgPayerScore", mode="before")
    @classmethod
    def coerce_float(cls, v):
        return _safe_float(v)


class DashboardResponse(BaseModel):
    summary: DashboardSummary
    riskDistribution: dict = {}
    typeDistribution: dict = {}
    scoreBuckets: dict = {}
    recentActivity: list[dict] = []
    attentionRequired: list[dict] = []


# ── Analysis History ─────────────────────────────────────────────
class AnalysisHistoryItem(BaseModel):
    id: str = ""
    documentId: str = ""
    documentName: str = ""
    documentSize: int = 0
    regulatorScore: float = 0.0
    payerScore: float = 0.0
    findingsCount: int = 0
    severityCounts: dict = {}
    typeCounts: dict = {}
    summary: str = ""
    findings: list = []
    analyzedAt: str = ""
    status: str = ""
    extractionMethod: Optional[str] = None

    @field_validator("documentSize", "findingsCount", mode="before")
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)

    @field_validator("regulatorScore", "payerScore", mode="before")
    @classmethod
    def coerce_float(cls, v):
        return _safe_float(v)

    @field_validator("id", "documentId", "documentName", "summary", "analyzedAt", "status", mode="before")
    @classmethod
    def coerce_str(cls, v):
        return _safe_str(v)

    @field_validator("findings", mode="before")
    @classmethod
    def coerce_findings(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            return []
        return v

    @field_validator("severityCounts", "typeCounts", mode="before")
    @classmethod
    def coerce_dict(cls, v):
        if v is None:
            return {}
        if not isinstance(v, dict):
            return {}
        return v


class AnalysisHistoryResponse(BaseModel):
    analyses: list[AnalysisHistoryItem] = []
    total: int = 0

    @field_validator("total", mode="before")
    @classmethod
    def coerce_total(cls, v):
        return _safe_int(v)


# ── Enhanced User Dashboard (adds chat & trends) ────────────────
class ChatUsageMetrics(BaseModel):
    totalConversations: int = 0
    totalMessages: int = 0
    userMessages: int = 0
    assistantMessages: int = 0
    avgMessagesPerConversation: float = 0.0
    totalCitations: int = 0
    avgCitationsPerResponse: float = 0.0
    mostActiveDocument: str = ""

    @field_validator(
        "totalConversations", "totalMessages", "userMessages",
        "assistantMessages", "totalCitations", mode="before",
    )
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)

    @field_validator("avgMessagesPerConversation", "avgCitationsPerResponse", mode="before")
    @classmethod
    def coerce_float(cls, v):
        return _safe_float(v)


class ScoreTrendPoint(BaseModel):
    date: str = ""
    documentName: str = ""
    regulatorScore: float = 0.0
    payerScore: float = 0.0


class DocumentComparisonItem(BaseModel):
    documentId: str = ""
    documentName: str = ""
    regulatorScore: float = 0.0
    payerScore: float = 0.0
    findingsCount: int = 0
    status: str = ""


class EnhancedDashboardResponse(BaseModel):
    """Extended user dashboard with RAG chat metrics and trend data."""
    summary: DashboardSummary
    riskDistribution: dict = {}
    typeDistribution: dict = {}
    scoreBuckets: dict = {}
    recentActivity: list[dict] = []
    attentionRequired: list[dict] = []
    chatUsage: ChatUsageMetrics = ChatUsageMetrics()
    scoreTrend: list[ScoreTrendPoint] = []
    documentComparison: list[DocumentComparisonItem] = []


# ══════════════════════════════════════════════════════════════════
# ADMIN ANALYTICS  (platform-wide, requires Admin role)
# ══════════════════════════════════════════════════════════════════

class AdminPlatformSummary(BaseModel):
    activeUsers: int = 0
    totalDocuments: int = 0
    totalAnalyses: int = 0
    totalJobs: int = 0
    avgRegulatorScore: float = 0.0
    avgPayerScore: float = 0.0
    totalFindings: int = 0

    @field_validator(
        "activeUsers", "totalDocuments", "totalAnalyses",
        "totalJobs", "totalFindings", mode="before",
    )
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)

    @field_validator("avgRegulatorScore", "avgPayerScore", mode="before")
    @classmethod
    def coerce_float(cls, v):
        return _safe_float(v)


class JobPipelineMetrics(BaseModel):
    totalJobs: int = 0
    successCount: int = 0
    failureCount: int = 0
    inProgressCount: int = 0
    queuedCount: int = 0
    successRate: float = 0.0
    failureRate: float = 0.0
    jobsByType: dict = {}
    jobsByStatus: dict = {}
    recentFailures: list[dict] = []

    @field_validator(
        "totalJobs", "successCount", "failureCount",
        "inProgressCount", "queuedCount", mode="before",
    )
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)

    @field_validator("successRate", "failureRate", mode="before")
    @classmethod
    def coerce_float(cls, v):
        return _safe_float(v)


class KBHealthMetrics(BaseModel):
    totalKBDocuments: int = 0
    totalKBSize: int = 0
    categories: dict = {}
    lastSyncStatus: str = "never"
    lastSyncTime: str = ""
    lastSyncJobId: str = ""

    @field_validator("totalKBDocuments", "totalKBSize", mode="before")
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)


class AdminChatMetrics(BaseModel):
    totalConversations: int = 0
    totalMessages: int = 0
    userMessages: int = 0
    assistantMessages: int = 0
    avgMessagesPerConversation: float = 0.0
    totalCitations: int = 0
    avgCitationsPerResponse: float = 0.0
    uniqueUsersChattedCount: int = 0

    @field_validator(
        "totalConversations", "totalMessages", "userMessages",
        "assistantMessages", "totalCitations", "uniqueUsersChattedCount",
        mode="before",
    )
    @classmethod
    def coerce_int(cls, v):
        return _safe_int(v)

    @field_validator("avgMessagesPerConversation", "avgCitationsPerResponse", mode="before")
    @classmethod
    def coerce_float(cls, v):
        return _safe_float(v)


class UserActivityItem(BaseModel):
    userId: str = ""
    email: str = ""
    documentCount: int = 0
    analysisCount: int = 0
    chatMessageCount: int = 0


class AdminPlatformResponse(BaseModel):
    """Full platform analytics for admins."""
    summary: AdminPlatformSummary
    riskDistribution: dict = {}
    scoreDistribution: dict = {}
    topFindingTypes: list[dict] = []
    worstDocuments: list[dict] = []
    jobPipeline: JobPipelineMetrics = JobPipelineMetrics()
    userActivity: list[UserActivityItem] = []


class AdminRAGResponse(BaseModel):
    """RAG & Knowledge Base analytics for admins."""
    kbHealth: KBHealthMetrics = KBHealthMetrics()
    chatMetrics: AdminChatMetrics = AdminChatMetrics()
    chatActivityByDay: list[dict] = []
    topChatDocuments: list[dict] = []
    citationDistribution: dict = {}
