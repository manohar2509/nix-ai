import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Users, FileText, ShieldAlert, BadgeDollarSign, AlertTriangle,
  TrendingUp, Activity, BarChart3, Database, MessageSquare, RefreshCw, Zap,
  CheckCircle, XCircle, Clock, Loader2, BookOpen, ArrowUpRight, ArrowDownRight,
  Server, Cpu, HardDrive, ChevronRight, Award, Target, Sparkles,
} from 'lucide-react';
import { useAuth, useAppStore } from '../stores/useAppStore';
import { analyticsService } from '../services/analyticsService';
import { cn } from '../utils/cn';

/* ── Animated counter ── */
function useCountUp(target, duration = 900) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !target) return;
    started.current = true;
    const start = Date.now();
    const step = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return count;
}

export default function AdminAnalyticsView() {
  const { user } = useAuth();
  const setActiveView = useAppStore((s) => s.setActiveView);

  const [platform, setPlatform] = useState(null);
  const [rag, setRag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([
        analyticsService.getAdminPlatform(),
        analyticsService.getAdminRAG(),
      ]);
      setPlatform(p);
      setRag(r);
    } catch (err) {
      setError(err.message || 'Failed to load admin analytics');
      // Provide empty defaults so the UI still renders
      setPlatform({
        summary: { activeUsers: 0, totalDocuments: 0, totalAnalyses: 0, totalJobs: 0, avgRegulatorScore: 0, avgPayerScore: 0, totalFindings: 0 },
        riskDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
        scoreDistribution: {},
        topFindingTypes: [],
        worstDocuments: [],
        jobPipeline: { totalJobs: 0, successCount: 0, failureCount: 0, inProgressCount: 0, queuedCount: 0, successRate: 0, failureRate: 0, jobsByType: {}, jobsByStatus: {}, recentFailures: [] },
        userActivity: [],
      });
      setRag({
        kbHealth: { totalKBDocuments: 0, totalKBSize: 0, categories: {}, lastSyncStatus: 'never', lastSyncTime: '', lastSyncJobId: '' },
        chatMetrics: { totalConversations: 0, totalMessages: 0, userMessages: 0, assistantMessages: 0, avgMessagesPerConversation: 0, totalCitations: 0, avgCitationsPerResponse: 0, uniqueUsersChattedCount: 0 },
        chatActivityByDay: [],
        topChatDocuments: [],
        citationDistribution: {},
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-[3px] border-slate-100 border-t-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-medium">Loading admin analytics...</p>
        </div>
      </div>
    );
  }

  const { summary, riskDistribution, scoreDistribution, topFindingTypes, worstDocuments, jobPipeline, userActivity } = platform;
  const { kbHealth, chatMetrics, chatActivityByDay, topChatDocuments, citationDistribution } = rag;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center text-white shadow-lg">
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Platform Analytics
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Admin view &middot; All users &middot; {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-purple-100 text-purple-700">
              Admin Only
            </span>
            <button onClick={loadAll} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <span className="font-medium">Note:</span> {error}. Showing defaults.
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            SECTION 1: PLATFORM SUMMARY CARDS
        ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
          <MetricCard label="Active Users" value={summary.activeUsers} icon={<Users size={18} />} color="purple" sub="users" />
          <MetricCard label="Documents" value={summary.totalDocuments} icon={<FileText size={18} />} color="brand" sub="total" />
          <MetricCard label="Analyses" value={summary.totalAnalyses} icon={<BarChart3 size={18} />} color="indigo" sub="completed" />
          <MetricCard label="Reg. Score" value={summary.avgRegulatorScore} icon={<ShieldAlert size={18} />} color={summary.avgRegulatorScore >= 60 ? 'green' : summary.avgRegulatorScore >= 40 ? 'amber' : 'red'} sub="platform avg" isScore />
          <MetricCard label="Payer Score" value={summary.avgPayerScore} icon={<BadgeDollarSign size={18} />} color={summary.avgPayerScore >= 60 ? 'green' : summary.avgPayerScore >= 40 ? 'amber' : 'red'} sub="platform avg" isScore />
          <MetricCard label="Findings" value={summary.totalFindings} icon={<AlertTriangle size={18} />} color="orange" sub="total" />
          <MetricCard label="Jobs" value={summary.totalJobs} icon={<Activity size={18} />} color="slate" sub="processed" />
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 2: RAG & KNOWLEDGE BASE HEALTH
        ═══════════════════════════════════════════════════════ */}
        <SectionHeader icon={<Database size={18} />} title="RAG & Knowledge Base" subtitle="Content health, retrieval quality, and chat intelligence" color="purple" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* KB Health */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-8 w-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                <HardDrive size={16} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Knowledge Base Health</h3>
            </div>
            <div className="space-y-4">
              <StatRow label="KB Documents" value={kbHealth.totalKBDocuments} />
              <StatRow label="Total Size" value={formatBytes(kbHealth.totalKBSize)} />
              <StatRow label="Last Sync" value={
                kbHealth.lastSyncStatus === 'never' ? 'Never synced' :
                  <span className={cn(
                    'font-semibold',
                    kbHealth.lastSyncStatus === 'COMPLETE' ? 'text-green-600' :
                      kbHealth.lastSyncStatus === 'FAILED' ? 'text-red-600' : 'text-amber-600'
                  )}>
                    {kbHealth.lastSyncStatus}
                  </span>
              } />
              {kbHealth.lastSyncTime && (
                <StatRow label="Sync Time" value={formatDate(kbHealth.lastSyncTime)} />
              )}
              {Object.keys(kbHealth.categories).length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(kbHealth.categories).map(([cat, count]) => (
                      <span key={cat} className="text-[10px] font-medium px-2 py-1 rounded-full bg-purple-50 text-purple-700">
                        {cat} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat Intelligence */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <MessageSquare size={16} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Chat Intelligence</h3>
            </div>
            <div className="space-y-4">
              <StatRow label="Conversations" value={chatMetrics.totalConversations} />
              <StatRow label="Total Messages" value={chatMetrics.totalMessages} />
              <StatRow label="Avg Msgs / Convo" value={chatMetrics.avgMessagesPerConversation} />
              <StatRow label="Users Who Chatted" value={chatMetrics.uniqueUsersChattedCount} />
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">User Messages</span>
                  <span className="font-semibold text-slate-700">{chatMetrics.userMessages}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1.5">
                  <span className="text-slate-400">AI Responses</span>
                  <span className="font-semibold text-slate-700">{chatMetrics.assistantMessages}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Citation Quality */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-8 w-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                <BookOpen size={16} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Retrieval Quality</h3>
            </div>
            <div className="space-y-4">
              <StatRow label="Total Citations" value={chatMetrics.totalCitations} />
              <StatRow label="Avg Citations / Response" value={chatMetrics.avgCitationsPerResponse} />
              {Object.keys(citationDistribution).length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Citation Distribution</p>
                  {Object.entries(citationDistribution).map(([bucket, count]) => (
                    <div key={bucket} className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] text-slate-500 w-10 text-right font-mono">{bucket}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max((count / Math.max(chatMetrics.assistantMessages, 1)) * 100, count > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 w-6">{count}</span>
                    </div>
                  ))}
                </div>
              )}
              {chatMetrics.avgCitationsPerResponse > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="text-[10px] text-emerald-700">
                    {chatMetrics.avgCitationsPerResponse >= 3
                      ? '✅ Strong retrieval — responses are well-grounded in KB content'
                      : chatMetrics.avgCitationsPerResponse >= 1
                        ? '⚠️ Moderate retrieval — consider adding more KB documents'
                        : '🔴 Low retrieval — RAG needs more reference material'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Activity Chart */}
        {chatActivityByDay.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Chat Activity (Last 30 Days)</h3>
            <MiniBarChart data={chatActivityByDay} valueKey="messages" labelKey="date" color="blue" />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            SECTION 3: SYSTEM PERFORMANCE — JOB PIPELINE
        ═══════════════════════════════════════════════════════ */}
        <SectionHeader icon={<Cpu size={18} />} title="System Performance" subtitle="Job pipeline health, throughput, and failure tracking" color="indigo" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Job Success/Failure */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-5">Job Pipeline</h3>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-green-50 rounded-xl p-4 border border-green-100 text-center">
                <CheckCircle size={20} className="mx-auto text-green-500 mb-1" />
                <div className="text-2xl font-bold text-green-700">{jobPipeline.successRate}%</div>
                <div className="text-[10px] text-green-600 font-medium">Success Rate</div>
                <div className="text-xs text-green-500 mt-0.5">{jobPipeline.successCount} jobs</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-center">
                <XCircle size={20} className="mx-auto text-red-500 mb-1" />
                <div className="text-2xl font-bold text-red-700">{jobPipeline.failureRate}%</div>
                <div className="text-[10px] text-red-600 font-medium">Failure Rate</div>
                <div className="text-xs text-red-500 mt-0.5">{jobPipeline.failureCount} jobs</div>
              </div>
            </div>
            <div className="space-y-2">
              <StatRow label="Total Jobs" value={jobPipeline.totalJobs} />
              <StatRow label="In Progress" value={jobPipeline.inProgressCount} />
              <StatRow label="Queued" value={jobPipeline.queuedCount} />
            </div>
          </div>

          {/* Jobs by Type + Status */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-5">Job Breakdown</h3>
            {Object.keys(jobPipeline.jobsByType).length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">By Type</p>
                {Object.entries(jobPipeline.jobsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-slate-500 flex-1 truncate">{formatJobType(type)}</span>
                    <div className="w-32 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full" style={{ width: `${(count / Math.max(jobPipeline.totalJobs, 1)) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(jobPipeline.jobsByStatus).length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">By Status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(jobPipeline.jobsByStatus).map(([status, count]) => (
                    <span key={status} className={cn(
                      'text-[10px] font-bold px-2.5 py-1.5 rounded-lg',
                      status === 'COMPLETE' ? 'bg-green-100 text-green-700' :
                        status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                    )}>
                      {status}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Failures */}
            {jobPipeline.recentFailures.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">Recent Failures</p>
                <div className="space-y-2">
                  {jobPipeline.recentFailures.map((f, idx) => (
                    <div key={idx} className="bg-red-50 border border-red-100 rounded-lg p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle size={12} className="text-red-500" />
                        <span className="text-[11px] font-semibold text-red-700">{formatJobType(f.type)}</span>
                        <span className="text-[9px] text-red-400 ml-auto">{formatDate(f.createdAt)}</span>
                      </div>
                      <p className="text-[10px] text-red-600 truncate">{f.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 4: DOCUMENT INTELLIGENCE
        ═══════════════════════════════════════════════════════ */}
        <SectionHeader icon={<Target size={18} />} title="Document Intelligence" subtitle="Platform-wide score distribution, risk landscape, and top findings" color="brand" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-5">Platform Risk Distribution</h3>
            <RiskBars distribution={riskDistribution} total={summary.totalFindings} />
          </div>

          {/* Score Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-5">Regulatory Score Distribution</h3>
            {Object.keys(scoreDistribution).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(scoreDistribution).map(([bucket, count]) => {
                  const barColor =
                    bucket === '0-25' ? 'bg-red-500' :
                      bucket === '26-50' ? 'bg-orange-500' :
                        bucket === '51-75' ? 'bg-amber-400' : 'bg-green-500';
                  const maxVal = Math.max(...Object.values(scoreDistribution), 1);
                  return (
                    <div key={bucket} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-500 w-14 text-right">{bucket}%</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${Math.max((count / maxVal) * 100, count > 0 ? 8 : 0)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-8">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="No score data yet" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Finding Types */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-5">Top Finding Types</h3>
            {topFindingTypes.length > 0 ? (
              <div className="space-y-2.5">
                {topFindingTypes.map((item, idx) => {
                  const maxCount = topFindingTypes[0]?.count || 1;
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-slate-500 w-24 text-right truncate">{item.type}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 w-8">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="No findings data yet" />
            )}
          </div>

          {/* Worst Scoring Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-5">Lowest Scoring Protocols</h3>
            {worstDocuments.length > 0 ? (
              <div className="space-y-3">
                {worstDocuments.slice(0, 6).map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="h-7 w-7 bg-red-100 rounded-lg flex items-center justify-center text-red-500 text-[10px] font-bold shrink-0">
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate">{doc.documentName}</div>
                      <div className="text-[10px] text-slate-400">{doc.findingsCount} findings</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center">
                        <div className={cn('text-xs font-bold', doc.regulatorScore >= 60 ? 'text-green-600' : doc.regulatorScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                          {Math.round(doc.regulatorScore)}%
                        </div>
                        <div className="text-[8px] text-slate-400">REG</div>
                      </div>
                      <div className="text-center">
                        <div className={cn('text-xs font-bold', doc.payerScore >= 60 ? 'text-green-600' : doc.payerScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                          {Math.round(doc.payerScore)}%
                        </div>
                        <div className="text-[8px] text-slate-400">PAY</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No analyses yet" />
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 5: USER ACTIVITY
        ═══════════════════════════════════════════════════════ */}
        <SectionHeader icon={<Users size={18} />} title="User Activity" subtitle="Top users by documents uploaded and analyses completed" color="violet" />

        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
          {userActivity.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3 pr-4">#</th>
                    <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3 pr-4">User ID</th>
                    <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3 pr-4 text-right">Documents</th>
                    <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3 pr-4 text-right">Analyses</th>
                    <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3 text-right">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivity.slice(0, 10).map((u, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 text-xs text-slate-400">{idx + 1}</td>
                      <td className="py-3 pr-4">
                        <span className="text-xs font-medium text-slate-700 font-mono">{u.userId.substring(0, 16)}...</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-xs font-bold text-slate-700">{u.documentCount}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-xs font-bold text-indigo-600">{u.analysisCount}</span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="w-20 ml-auto bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full" style={{ width: `${(u.documentCount / Math.max(userActivity[0].documentCount, 1)) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="No user activity data" />
          )}
        </div>

        {/* ── Quick Actions Footer ── */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-600 to-indigo-600 rounded-2xl p-6 flex items-center justify-between shadow-lg">
          <div>
            <h3 className="text-white font-bold text-lg">Admin Command Center</h3>
            <p className="text-purple-200 text-sm mt-1">Manage KB, review protocols, or return to your dashboard</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setActiveView('dashboard')} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-purple-100 bg-white/10 rounded-xl hover:bg-white/20 transition-colors">
              <LayoutDashboard size={16} /> My Dashboard
            </button>
            <button onClick={() => setActiveView('protocol')} className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-purple-700 bg-white rounded-xl hover:bg-purple-50 transition-colors shadow-sm">
              <Sparkles size={16} /> Analyze Protocol
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   Sub-Components
   ════════════════════════════════════════════════════════════════ */

function MetricCard({ label, value, icon, color, sub, isScore }) {
  const displayValue = useCountUp(Math.round(value || 0), 800);
  const bgMap = {
    purple: 'bg-purple-50 text-purple-600',
    brand: 'bg-brand-50 text-brand-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', bgMap[color] || bgMap.brand)}>
          {icon}
        </div>
        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{sub}</span>
      </div>
      <div className="text-xl font-bold text-slate-900 tabular-nums">
        {isScore ? `${displayValue}%` : displayValue}
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{label}</div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle, color }) {
  const colorMap = {
    purple: 'from-purple-500 to-purple-600',
    indigo: 'from-indigo-500 to-indigo-600',
    brand: 'from-brand-500 to-brand-600',
    violet: 'from-violet-500 to-violet-600',
  };
  return (
    <div className="flex items-center gap-3 pt-4">
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br shadow-sm', colorMap[color] || colorMap.brand)}>
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-700">{value}</span>
    </div>
  );
}

function RiskBars({ distribution, total }) {
  const items = [
    { key: 'critical', label: 'Critical', color: 'bg-red-500', count: distribution.critical || 0 },
    { key: 'high', label: 'High', color: 'bg-orange-500', count: distribution.high || 0 },
    { key: 'medium', label: 'Medium', color: 'bg-amber-400', count: distribution.medium || 0 },
    { key: 'low', label: 'Low', color: 'bg-green-500', count: distribution.low || 0 },
  ];
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  if (total === 0) return <EmptyState text="No findings data yet" />;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 w-14 text-right">{item.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-700', item.color)} style={{ width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%` }} />
          </div>
          <span className="text-xs font-bold text-slate-700 w-8 tabular-nums">{item.count}</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-400 font-medium">Total Findings</span>
        <span className="text-sm font-bold text-slate-700">{total}</span>
      </div>
    </div>
  );
}

function MiniBarChart({ data, valueKey, labelKey, color }) {
  const maxVal = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  const colorMap = { blue: 'bg-blue-400', purple: 'bg-purple-400', brand: 'bg-brand-500' };
  const barColor = colorMap[color] || colorMap.blue;

  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center group relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {d[labelKey]}: {d[valueKey]}
          </div>
          <div
            className={cn('w-full rounded-t transition-all duration-300', barColor, 'min-h-[2px]')}
            style={{ height: `${Math.max((d[valueKey] / maxVal) * 100, 3)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-6">
      <BarChart3 size={24} className="mx-auto text-slate-300 mb-2" />
      <p className="text-xs text-slate-400">{text}</p>
    </div>
  );
}


/* ── Helpers ── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function formatJobType(type) {
  const map = { ANALYZE_DOCUMENT: 'Document Analysis', KB_SYNC: 'KB Sync', SYNTHETIC_GENERATION: 'Synthetic Gen' };
  return map[type] || type;
}
