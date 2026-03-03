import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, FileText, ShieldAlert, BadgeDollarSign, AlertTriangle,
  TrendingUp, Activity, Clock, ChevronRight, RefreshCw, Zap, BarChart3,
  CheckCircle, XCircle, Loader2, Eye, Upload, ArrowUpRight, ArrowDownRight,
  MessageSquare, BookOpen, Info, HelpCircle, ChevronDown, Hash, Briefcase,
  AlertCircle, Sparkles, Download,
} from 'lucide-react';
import { useAuth, useAppStore } from '../stores/useAppStore';
import { analyticsService } from '../services/analyticsService';
import { documentService } from '../services/documentService';
import jobService from '../services/jobService';
import DetailDrawer, { DetailSection, DetailStat, DetailList, DetailRow } from './DetailDrawer';
import { cn } from '../utils/cn';

/* ── Animated counter hook ── */
function useCountUp(target, duration = 1000) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !target) return;
    started.current = true;
    const startTime = Date.now();
    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return count;
}

export default function DashboardView() {
  const { user } = useAuth();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setCurrentDocument = useAppStore((s) => s.setCurrentDocument);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Drilldown drawer state
  const [drawer, setDrawer] = useState({ open: false, type: null, context: null });
  const openDrawer = (type, context = null) => setDrawer({ open: true, type, context });
  const closeDrawer = () => setDrawer({ open: false, type: null, context: null });

  // Extra data loaded on demand for drawers
  const [allDocuments, setAllDocuments] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyticsService.getDashboard();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
      // Use empty defaults so UI still renders
      setData({
        summary: { totalDocuments: 0, totalAnalyses: 0, totalJobs: 0, avgRegulatorScore: 0, avgPayerScore: 0, totalFindings: 0 },
        riskDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
        typeDistribution: {},
        scoreBuckets: {},
        recentActivity: [],
        attentionRequired: [],
        chatUsage: { totalConversations: 0, totalMessages: 0, userMessages: 0, assistantMessages: 0, avgMessagesPerConversation: 0, totalCitations: 0, avgCitationsPerResponse: 0, mostActiveDocument: '' },
        scoreTrend: [],
        documentComparison: [],
      });
    } finally {
      setLoading(false);
    }
  };

  // Load full document list on demand
  const loadDocuments = async () => {
    if (docsLoaded) return allDocuments;
    try {
      const docs = await documentService.listDocuments();
      setAllDocuments(docs);
      setDocsLoaded(true);
      return docs;
    } catch { return []; }
  };

  // Load full job list on demand
  const loadJobs = async () => {
    if (jobsLoaded) return allJobs;
    try {
      const jobs = await jobService.listJobs(100);
      setAllJobs(jobs);
      setJobsLoaded(true);
      return jobs;
    } catch { return []; }
  };

  // Open drawer handlers
  const handleOpenDocuments = async () => {
    openDrawer('documents');
    await loadDocuments();
  };
  const handleOpenAnalyses = () => { setActiveView('history'); };
  const handleOpenJobs = async () => {
    openDrawer('jobs');
    await loadJobs();
  };
  const handleOpenFindings = () => { openDrawer('findings'); };
  const handleOpenRegScore = () => { openDrawer('regScore'); };
  const handleOpenPayScore = () => { openDrawer('payScore'); };
  const handleOpenRiskDetail = (severity) => { openDrawer('riskSeverity', severity); };
  const handleOpenDocComparison = (doc) => {
    setCurrentDocument({ id: doc.documentId, name: doc.documentName, status: 'analyzed' });
    setActiveView('protocol');
  };
  const handleOpenScoreTrendItem = (point) => {
    openDrawer('scoreTrendItem', point);
  };
  const handleOpenActivityItem = async (item) => {
    if (item.jobId) {
      openDrawer('jobDetail', item);
      try {
        const jobDetail = await jobService.getJobStatus(item.jobId);
        setDrawer(prev => ({ ...prev, context: { ...item, ...jobDetail } }));
      } catch { /* keep original */ }
    }
  };
  const handleOpenChatUsage = () => { openDrawer('chatUsage'); };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const { summary, riskDistribution, typeDistribution, recentActivity, attentionRequired, scoreBuckets, chatUsage, scoreTrend, documentComparison } = data;
  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 space-y-8">

        {/* ── Welcome Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Your clinical trial protocol intelligence overview &middot; {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadDashboard}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={() => setActiveView('protocol')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
            >
              <Zap size={14} />
              Analyze Protocol
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <span className="font-medium">Note:</span> {error}. Showing cached data.
          </div>
        )}

        {/* ── Summary Cards ── */}
        <SectionExplainer
          title="Key Metrics"
          description="These six cards summarize your overall platform usage. Documents counts your uploaded protocols, Analyses shows how many have been reviewed by the AI council, Scores reflect average regulatory and payer alignment, Findings counts all detected issues, and Jobs tracks background processing tasks."
        />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <SummaryCard
            label="Protocols"
            value={summary.totalDocuments}
            icon={<FileText size={18} />}
            color="brand"
            subtitle="uploaded"
            tooltip="Total number of clinical trial protocols uploaded to your workspace for regulatory analysis."
            onClick={handleOpenDocuments}
          />
          <SummaryCard
            label="Analyses"
            value={summary.totalAnalyses}
            icon={<BarChart3 size={18} />}
            color="indigo"
            subtitle="completed"
            tooltip="Number of completed AI regulatory and payer analyses. Each analysis evaluates your protocol against ICH, FDA, EMA, and HTA body requirements."
            onClick={handleOpenAnalyses}
          />
          <SummaryCard
            label="Compliance Score"
            value={summary.avgRegulatorScore}
            icon={<ShieldAlert size={18} />}
            color={summary.avgRegulatorScore >= 60 ? 'green' : summary.avgRegulatorScore >= 40 ? 'amber' : 'red'}
            subtitle="avg"
            isScore
            tooltip="Average Regulatory Compliance Score across all analyses. ≥60% indicates strong ICH/FDA/EMA alignment, 40–59% needs improvement, <40% has significant compliance gaps that could delay approval."
            onClick={handleOpenRegScore}
          />
          <SummaryCard
            label="Payer Readiness"
            value={summary.avgPayerScore}
            icon={<BadgeDollarSign size={18} />}
            color={summary.avgPayerScore >= 60 ? 'green' : summary.avgPayerScore >= 40 ? 'amber' : 'red'}
            subtitle="avg"
            isScore
            tooltip="Average Payer & HTA Readiness Score. ≥60% suggests strong reimbursement potential, 40–59% means some evidence gaps for NICE/IQWiG/CADTH, <40% indicates significant barriers to market access."
            onClick={handleOpenPayScore}
          />
          <SummaryCard
            label="Findings"
            value={summary.totalFindings}
            icon={<AlertTriangle size={18} />}
            color="orange"
            subtitle="total"
            tooltip="Total number of regulatory compliance issues, payer evidence gaps, and improvement recommendations identified across all protocol analyses."
            onClick={handleOpenFindings}
          />
          <SummaryCard
            label="Jobs"
            value={summary.totalJobs}
            icon={<Activity size={18} />}
            color="slate"
            subtitle="processed"
            tooltip="Total background processing tasks completed, including protocol analyses, reference library updates, and comparison jobs."
            onClick={handleOpenJobs}
          />
        </div>

        {/* ── Middle Row: Risk Distribution + Score Overview ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Risk Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Risk Distribution</h3>
                <p className="text-xs text-slate-400 mt-0.5">Findings by severity across all analyses</p>
              </div>
              <div className="h-8 w-8 bg-red-50 rounded-lg flex items-center justify-center text-red-500">
                <ShieldAlert size={16} />
              </div>
            </div>
            <InfoBanner text="Shows how your protocol findings break down by severity. Critical = immediate regulatory risk. High = likely rejection concern. Medium = should address before submission. Low = minor improvement suggested." />
            <RiskDistributionChart distribution={riskDistribution} total={summary.totalFindings} onBarClick={handleOpenRiskDetail} />
          </div>

          {/* Score Comparison */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Score Overview</h3>
                <p className="text-xs text-slate-400 mt-0.5">Average regulatory &amp; payer viability</p>
              </div>
              <div className="h-8 w-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600">
                <TrendingUp size={16} />
              </div>
            </div>
            <InfoBanner text="Regulatory Score measures FDA/EMA compliance (study design, endpoints, safety). Payer Score evaluates reimbursement potential (cost-effectiveness, comparators, real-world evidence). Both are generated by NIX AI's regulatory intelligence engine." />
            <ScoreOverview
              regScore={summary.avgRegulatorScore}
              payScore={summary.avgPayerScore}
              totalAnalyses={summary.totalAnalyses}
            />
          </div>
        </div>

        {/* ── Bottom Row: Attention Required + Recent Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Documents Needing Attention */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Needs Attention</h3>
                <p className="text-xs text-slate-400 mt-0.5">Protocols with critical risk findings</p>
              </div>
              <button
                onClick={() => setActiveView('history')}
                className="text-xs text-brand-600 font-medium hover:text-brand-700 flex items-center gap-1"
              >
                View All <ChevronRight size={14} />
              </button>
            </div>
            <InfoBanner text="Protocols flagged here have critical or high-severity findings that could lead to regulatory rejection. Prioritize reviewing these before submission." />
            {attentionRequired.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={32} className="mx-auto text-green-400 mb-2" />
                <p className="text-sm text-slate-500 font-medium">All clear!</p>
                <p className="text-xs text-slate-400 mt-1">No protocols require immediate attention</p>
              </div>
            ) : (
              <div className="space-y-3">
                {attentionRequired.map((item, idx) => (
                  <AttentionCard key={idx} item={item} onViewAnalysis={() => {
                    setCurrentDocument({ id: item.documentId, name: item.documentName, status: 'analyzed' });
                    setActiveView('protocol');
                  }} />
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Recent Activity</h3>
                <p className="text-xs text-slate-400 mt-0.5">Latest jobs and analyses</p>
              </div>
              <Clock size={16} className="text-slate-300" />
            </div>
            <InfoBanner text="Timeline of your recent platform actions — document analyses, KB syncs, and generation tasks. Statuses: green = complete, red = failed, amber = queued, spinning = in progress." />
            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <Activity size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500 font-medium">No activity yet</p>
                <p className="text-xs text-slate-400 mt-1">Upload a protocol and run an analysis to get started</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((item, idx) => (
                  <ActivityItem key={idx} item={item} onClick={() => handleOpenActivityItem(item)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Chat & RAG Usage ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow group" onClick={handleOpenChatUsage}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">AI Consultation Activity</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your interactions with the regulatory AI assistant</p>
              </div>
              <div className="flex items-center gap-2">
                <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                  <MessageSquare size={16} />
                </div>
              </div>
            </div>
            <InfoBanner text="Tracks your AI regulatory consultation interactions. Citations indicate how many regulatory reference documents grounded the AI’s response — higher citation rates mean better evidence-based answers. Low citation rates may indicate the reference library needs more content." />
            {chatUsage && chatUsage.totalMessages > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                    <div className="text-xl font-bold text-blue-700">{chatUsage.totalConversations}</div>
                    <div className="text-[10px] text-blue-500 font-medium">Conversations</div>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-center">
                    <div className="text-xl font-bold text-indigo-700">{chatUsage.totalMessages}</div>
                    <div className="text-[10px] text-indigo-500 font-medium">Messages</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Your Questions</span><span className="font-semibold text-slate-700">{chatUsage.userMessages}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">AI Responses</span><span className="font-semibold text-slate-700">{chatUsage.assistantMessages}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Avg Msgs / Conversation</span><span className="font-semibold text-slate-700">{chatUsage.avgMessagesPerConversation}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Citations Retrieved</span><span className="font-semibold text-slate-700">{chatUsage.totalCitations}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-400">Avg Citations / Response</span><span className="font-semibold text-slate-700">{chatUsage.avgCitationsPerResponse}</span></div>
                </div>
                {chatUsage.mostActiveDocument && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Most Active</span>
                    <p className="text-xs font-semibold text-slate-700 mt-1 truncate">{chatUsage.mostActiveDocument}</p>
                  </div>
                )}
                {chatUsage.avgCitationsPerResponse > 0 && (
                  <div className={cn(
                    'rounded-xl p-3 border text-[10px]',
                    chatUsage.avgCitationsPerResponse >= 3 ? 'bg-green-50 border-green-100 text-green-700' :
                    chatUsage.avgCitationsPerResponse >= 1 ? 'bg-amber-50 border-amber-100 text-amber-700' :
                    'bg-red-50 border-red-100 text-red-700'
                  )}>
                    {chatUsage.avgCitationsPerResponse >= 3 ? '✅ Great retrieval quality — responses are well-grounded' :
                     chatUsage.avgCitationsPerResponse >= 1 ? '⚠️ Moderate retrieval — try more specific questions' :
                     '🔴 Low citation rate — the KB may need more content'}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageSquare size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500 font-medium">No AI consultations yet</p>
                <p className="text-xs text-slate-400 mt-1">Use the Ask AI tab in the protocol view to get regulatory guidance</p>
              </div>
            )}
          </div>

          {/* Document Comparison */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Protocol Score Comparison</h3>
                <p className="text-xs text-slate-400 mt-0.5">Side-by-side regulatory & payer scores</p>
              </div>
              <div className="h-8 w-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600">
                <BarChart3 size={16} />
              </div>
            </div>
            <InfoBanner text="Compare your clinical trial protocols side-by-side. REG = Regulatory Compliance Score (ICH/FDA/EMA), PAY = Payer Readiness Score (HTA bodies). Use this to identify which protocols need the most attention." />
            {documentComparison && documentComparison.length > 0 ? (
              <div className="space-y-3">
                {documentComparison.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition-colors cursor-pointer group" onClick={() => handleOpenDocComparison(doc)}>
                    <div className="h-8 w-8 bg-brand-100 rounded-lg flex items-center justify-center text-brand-600 text-[10px] font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate">{doc.documentName}</div>
                      <div className="text-[10px] text-slate-400">{doc.findingsCount} findings</div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
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
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BarChart3 size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500 font-medium">No protocol comparisons yet</p>
                <p className="text-xs text-slate-400 mt-1">Analyze multiple protocols to compare compliance scores side by side</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Score Trend ── */}
        {scoreTrend && scoreTrend.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Compliance Score Trend</h3>
                <p className="text-xs text-slate-400 mt-0.5">How your protocol compliance scores are evolving over time</p>
              </div>
              <div className="h-8 w-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-500">
                <TrendingUp size={16} />
              </div>
            </div>
            <InfoBanner text="Track how your protocol scores evolve across analyses. Green arrows show improvement, red arrows indicate regression. Consistent improvement suggests your revisions are addressing the identified issues effectively." />
            <div className="space-y-2">
              {scoreTrend.map((point, idx) => {
                const prevReg = idx > 0 ? scoreTrend[idx - 1].regulatorScore : null;
                const prevPay = idx > 0 ? scoreTrend[idx - 1].payerScore : null;
                const regDelta = prevReg !== null ? point.regulatorScore - prevReg : 0;
                const payDelta = prevPay !== null ? point.payerScore - prevPay : 0;
                return (
                  <div key={idx} className="flex items-center gap-4 py-2.5 px-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 cursor-pointer group" onClick={() => handleOpenScoreTrendItem(point)}>
                    <div className="text-[10px] text-slate-400 w-28 shrink-0">
                      {point.date ? new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </div>
                    <div className="flex-1 min-w-0 text-xs font-medium text-slate-600 truncate">{point.documentName}</div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className={cn('text-xs font-bold', point.regulatorScore >= 60 ? 'text-green-600' : point.regulatorScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                          {Math.round(point.regulatorScore)}%
                        </span>
                        {regDelta !== 0 && (
                          <span className={cn('text-[9px] font-bold flex items-center', regDelta > 0 ? 'text-green-500' : 'text-red-500')}>
                            {regDelta > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {Math.abs(Math.round(regDelta))}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={cn('text-xs font-bold', point.payerScore >= 60 ? 'text-green-600' : point.payerScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                          {Math.round(point.payerScore)}%
                        </span>
                        {payDelta !== 0 && (
                          <span className={cn('text-[9px] font-bold flex items-center', payDelta > 0 ? 'text-green-500' : 'text-red-500')}>
                            {payDelta > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {Math.abs(Math.round(payDelta))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <ShieldAlert size={10} /> REG = Regulatory Compliance
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <BadgeDollarSign size={10} /> PAY = Payer Readiness
              </div>
            </div>
          </div>
        )}

        {/* ── Quick Actions Footer ── */}
        <div className="bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 rounded-2xl p-6 flex items-center justify-between shadow-md">
          <div>
            <h3 className="text-white font-bold text-lg">Ready to review a protocol?</h3>
            <p className="text-brand-100/80 text-sm mt-1">Upload a new clinical trial protocol for regulatory and payer readiness analysis</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setActiveView('history')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-brand-100 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
            >
              <Eye size={16} />
              Analysis History
            </button>
            <button
              onClick={() => setActiveView('protocol')}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-brand-700 bg-white rounded-xl hover:bg-brand-50 transition-colors shadow-sm"
            >
              <Upload size={16} />
              Upload Protocol
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          DRILLDOWN DRAWERS
         ════════════════════════════════════════════════════════ */}

      {/* Documents Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'documents'}
        onClose={closeDrawer}
        title="All Protocols"
        subtitle={`${allDocuments.length} protocols uploaded`}
        icon={<FileText size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Protocols' }]}
      >
        <DetailSection title="Document List">
          <DetailList
            items={allDocuments}
            emptyText="No documents uploaded yet"
            renderItem={(doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-200 cursor-pointer transition-colors"
                onClick={() => { closeDrawer(); setCurrentDocument(doc); setActiveView('protocol'); }}
              >
                <div className="h-9 w-9 bg-brand-100 rounded-lg flex items-center justify-center text-brand-600 shrink-0">
                  <FileText size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{doc.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2">
                    <span>{formatBytes(doc.size)}</span>
                    <span>&middot;</span>
                    <span>{formatTimeAgo(doc.createdAt || doc.created_at)}</span>
                    {doc.status && (
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                        doc.status === 'analyzed' ? 'bg-green-100 text-green-700' :
                        doc.status === 'analyzing' ? 'bg-amber-100 text-amber-700' :
                        doc.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-500'
                      )}>{doc.status}</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </div>
            )}
          />
        </DetailSection>
      </DetailDrawer>

      {/* Jobs Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'jobs'}
        onClose={closeDrawer}
        title="All Jobs"
        subtitle={`${allJobs.length} jobs processed`}
        icon={<Activity size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Jobs' }]}
      >
        <DetailSection title="Job History">
          <DetailList
            items={allJobs}
            emptyText="No jobs found"
            renderItem={(job) => (
              <div key={job.id || job.jobId} className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 cursor-pointer transition-colors"
                onClick={() => openDrawer('jobDetail', job)}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                    job.status === 'COMPLETE' ? 'bg-green-100 text-green-600' :
                    job.status === 'FAILED' ? 'bg-red-100 text-red-600' :
                    job.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-600' :
                    'bg-amber-100 text-amber-600'
                  )}>
                    {job.status === 'COMPLETE' ? <CheckCircle size={16} /> :
                     job.status === 'FAILED' ? <XCircle size={16} /> :
                     job.status === 'IN_PROGRESS' ? <Loader2 size={16} className="animate-spin" /> :
                     <Clock size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700">{formatJobType(job.type || job.jobType)}</div>
                    <div className="text-[10px] text-slate-400">
                      {job.id || job.jobId} &middot; {formatTimeAgo(job.createdAt || job.created_at)}
                    </div>
                  </div>
                  <span className={cn(
                    'text-[9px] font-bold uppercase px-2 py-1 rounded-full',
                    job.status === 'COMPLETE' ? 'bg-green-100 text-green-700' :
                    job.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                    job.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  )}>{job.status}</span>
                </div>
                {job.error && (
                  <div className="mt-2 text-[11px] text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">
                    {job.error}
                  </div>
                )}
              </div>
            )}
          />
        </DetailSection>
      </DetailDrawer>

      {/* Job Detail Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'jobDetail'}
        onClose={closeDrawer}
        title="Job Details"
        subtitle={drawer.context?.id || drawer.context?.jobId || ''}
        icon={<Briefcase size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Jobs', onClick: () => openDrawer('jobs') }, { label: 'Detail' }]}
      >
        {drawer.context && (() => {
          const job = drawer.context;
          return (
            <>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <DetailStat label="Status" value={job.status || 'Unknown'} color={
                  job.status === 'COMPLETE' ? 'text-green-600' : job.status === 'FAILED' ? 'text-red-600' : 'text-amber-600'
                } />
                <DetailStat label="Type" value={formatJobType(job.type || job.jobType)} />
              </div>
              <DetailRow label="Job ID" value={job.id || job.jobId || '—'} />
              <DetailRow label="Created" value={job.createdAt || job.created_at || '—'} />
              {job.completedAt && <DetailRow label="Completed" value={job.completedAt} />}
              {job.progress && (
                <>
                  <DetailRow label="Progress" value={`${job.progress.percent || 0}%`} />
                  {job.progress.current != null && (
                    <DetailRow label="Steps" value={`${job.progress.current} / ${job.progress.total}`} />
                  )}
                </>
              )}
              {job.currentStep && <DetailRow label="Current Step" value={job.currentStep} />}
              {job.error && (
                <DetailSection title="Error" className="mt-4">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                    {job.error}
                  </div>
                </DetailSection>
              )}
              {job.params && (
                <DetailSection title="Parameters" className="mt-4">
                  <pre className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 overflow-x-auto font-mono">
                    {JSON.stringify(job.params, null, 2)}
                  </pre>
                </DetailSection>
              )}
            </>
          );
        })()}
      </DetailDrawer>

      {/* Findings Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'findings'}
        onClose={closeDrawer}
        title="Findings Overview"
        subtitle={`${summary.totalFindings} total findings across all analyses`}
        icon={<AlertTriangle size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Findings' }]}
      >
        <DetailSection title="Severity Breakdown">
          <div className="grid grid-cols-4 gap-3 mb-6">
            <DetailStat label="Critical" value={riskDistribution.critical} color="text-red-600" />
            <DetailStat label="High" value={riskDistribution.high} color="text-orange-600" />
            <DetailStat label="Medium" value={riskDistribution.medium} color="text-amber-600" />
            <DetailStat label="Low" value={riskDistribution.low} color="text-green-600" />
          </div>
        </DetailSection>
        {typeDistribution && Object.keys(typeDistribution).length > 0 && (
          <DetailSection title="Finding Types">
            <div className="space-y-2">
              {Object.entries(typeDistribution).map(([type, count]) => {
                const maxVal = Math.max(...Object.values(typeDistribution), 1);
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 w-28 text-right truncate">{type}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full" style={{ width: `${(count / maxVal) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-8">{count}</span>
                  </div>
                );
              })}
            </div>
          </DetailSection>
        )}
        {documentComparison && documentComparison.length > 0 && (
          <DetailSection title="Findings per Document">
            <div className="space-y-2">
              {[...documentComparison].sort((a, b) => b.findingsCount - a.findingsCount).map((doc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => handleOpenDocComparison(doc)}>
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{doc.documentName}</span>
                  <span className="text-xs font-bold text-orange-600">{doc.findingsCount} findings</span>
                  <ChevronRight size={12} className="text-slate-300" />
                </div>
              ))}
            </div>
          </DetailSection>
        )}
      </DetailDrawer>

      {/* Risk Severity Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'riskSeverity'}
        onClose={closeDrawer}
        title={`${drawer.context ? drawer.context.charAt(0).toUpperCase() + drawer.context.slice(1) : ''} Findings`}
        subtitle={`${riskDistribution[drawer.context] || 0} findings at ${drawer.context} severity`}
        icon={<AlertTriangle size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Risk Distribution' }, { label: drawer.context || '' }]}
      >
        <div className={cn(
          'rounded-xl p-4 border mb-6',
          drawer.context === 'critical' ? 'bg-red-50 border-red-200' :
          drawer.context === 'high' ? 'bg-orange-50 border-orange-200' :
          drawer.context === 'medium' ? 'bg-amber-50 border-amber-200' :
          'bg-green-50 border-green-200'
        )}>
          <p className="text-sm font-medium text-slate-800 mb-1">
            {drawer.context === 'critical' ? '🔴 Critical — Immediate regulatory risk. Could halt approval.' :
             drawer.context === 'high' ? '🟠 High — Likely to cause significant reviewer objections.' :
             drawer.context === 'medium' ? '🟡 Medium — Should address before submission for best outcome.' :
             '🟢 Low — Minor improvement opportunities. Not blocking.'}
          </p>
          <p className="text-xs text-slate-500">
            {riskDistribution[drawer.context] || 0} out of {summary.totalFindings} total findings are at this severity level
            ({summary.totalFindings > 0 ? Math.round(((riskDistribution[drawer.context] || 0) / summary.totalFindings) * 100) : 0}%).
          </p>
        </div>
        <DetailSection title="Affected Documents">
          <p className="text-xs text-slate-400 mb-3">
            Click a document to view its full analysis and findings.
          </p>
          {documentComparison && documentComparison.length > 0 ? (
            <div className="space-y-2">
              {documentComparison.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => handleOpenDocComparison(doc)}>
                  <FileText size={14} className="text-brand-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{doc.documentName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-[10px] font-bold', doc.regulatorScore >= 60 ? 'text-green-600' : doc.regulatorScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                      REG {Math.round(doc.regulatorScore)}%
                    </span>
                    <ChevronRight size={12} className="text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">No documents with analyses yet.</p>
          )}
        </DetailSection>
      </DetailDrawer>

      {/* Reg Score Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'regScore'}
        onClose={closeDrawer}
        title="Regulatory Compliance Score"
        subtitle={`Average: ${summary.avgRegulatorScore}% across ${summary.totalAnalyses} analyses`}
        icon={<ShieldAlert size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Regulatory Score' }]}
      >
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-600">Platform Average</span>
            <span className={cn('text-2xl font-bold', summary.avgRegulatorScore >= 60 ? 'text-green-600' : summary.avgRegulatorScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
              {summary.avgRegulatorScore}%
            </span>
          </div>
          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full',
              summary.avgRegulatorScore >= 60 ? 'bg-gradient-to-r from-green-400 to-green-500' :
              summary.avgRegulatorScore >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
              'bg-gradient-to-r from-red-400 to-red-500'
            )} style={{ width: `${Math.min(summary.avgRegulatorScore, 100)}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {summary.avgRegulatorScore >= 60 ? 'Your protocols show acceptable regulatory alignment. Minor revisions may still be needed.' :
             summary.avgRegulatorScore >= 40 ? 'Moderate regulatory risk detected. Several issues need to be addressed before submission.' :
             'High regulatory risk. Significant compliance concerns detected across your protocols.'}
          </p>
        </div>
        <DetailSection title="Score Thresholds">
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-100">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-green-700">≥60% — Acceptable</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
              <div className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-amber-700">40–59% — Needs Improvement</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-xs font-medium text-red-700">&lt;40% — High Risk</span>
            </div>
          </div>
        </DetailSection>
        {scoreBuckets && Object.keys(scoreBuckets).length > 0 && (
          <DetailSection title="Score Distribution">
            <div className="space-y-2">
              {Object.entries(scoreBuckets).map(([bucket, count]) => {
                const maxVal = Math.max(...Object.values(scoreBuckets), 1);
                const barColor = bucket === '0-25' ? 'bg-red-500' : bucket === '26-50' ? 'bg-orange-500' : bucket === '51-75' ? 'bg-amber-400' : 'bg-green-500';
                return (
                  <div key={bucket} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 w-14 text-right">{bucket}%</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.max((count / maxVal) * 100, count > 0 ? 8 : 0)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-8">{count}</span>
                  </div>
                );
              })}
            </div>
          </DetailSection>
        )}
        <DetailSection title="Per-Document Scores">
          {documentComparison.length > 0 ? (
            <div className="space-y-2">
              {[...documentComparison].sort((a, b) => a.regulatorScore - b.regulatorScore).map((doc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => handleOpenDocComparison(doc)}>
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{doc.documentName}</span>
                  <span className={cn('text-xs font-bold', doc.regulatorScore >= 60 ? 'text-green-600' : doc.regulatorScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                    {Math.round(doc.regulatorScore)}%
                  </span>
                  <ChevronRight size={12} className="text-slate-300" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">No analyses yet</p>
          )}
        </DetailSection>
      </DetailDrawer>

      {/* Payer Score Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'payScore'}
        onClose={closeDrawer}
        title="Payer Readiness Score"
        subtitle={`Average: ${summary.avgPayerScore}% across ${summary.totalAnalyses} analyses`}
        icon={<BadgeDollarSign size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Payer Readiness' }]}
      >
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-600">Platform Average</span>
            <span className={cn('text-2xl font-bold', summary.avgPayerScore >= 60 ? 'text-green-600' : summary.avgPayerScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
              {summary.avgPayerScore}%
            </span>
          </div>
          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full',
              summary.avgPayerScore >= 60 ? 'bg-gradient-to-r from-green-400 to-emerald-500' :
              summary.avgPayerScore >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
              'bg-gradient-to-r from-red-400 to-red-500'
            )} style={{ width: `${Math.min(summary.avgPayerScore, 100)}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {summary.avgPayerScore >= 60 ? 'Strong payer alignment across your protocols. Reimbursement potential is favorable.' :
             summary.avgPayerScore >= 40 ? 'Moderate payer viability. Cost-effectiveness concerns have been flagged.' :
             'Low payer viability. Significant payer objections expected across your protocol portfolio.'}
          </p>
        </div>
        <DetailSection title="Per-Document Payer Scores">
          {documentComparison.length > 0 ? (
            <div className="space-y-2">
              {[...documentComparison].sort((a, b) => a.payerScore - b.payerScore).map((doc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => handleOpenDocComparison(doc)}>
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{doc.documentName}</span>
                  <span className={cn('text-xs font-bold', doc.payerScore >= 60 ? 'text-green-600' : doc.payerScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
                    {Math.round(doc.payerScore)}%
                  </span>
                  <ChevronRight size={12} className="text-slate-300" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">No analyses yet</p>
          )}
        </DetailSection>
      </DetailDrawer>

      {/* Score Trend Item Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'scoreTrendItem'}
        onClose={closeDrawer}
        title={drawer.context?.documentName || 'Analysis Detail'}
        subtitle={drawer.context?.date ? new Date(drawer.context.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
        icon={<TrendingUp size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'Score Trend' }, { label: drawer.context?.documentName || '' }]}
        width="md"
      >
        {drawer.context && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <DetailStat
                label="Regulatory Score"
                value={`${Math.round(drawer.context.regulatorScore)}%`}
                color={drawer.context.regulatorScore >= 60 ? 'text-green-600' : drawer.context.regulatorScore >= 40 ? 'text-amber-600' : 'text-red-600'}
                large
              />
              <DetailStat
                label="Payer Score"
                value={`${Math.round(drawer.context.payerScore)}%`}
                color={drawer.context.payerScore >= 60 ? 'text-green-600' : drawer.context.payerScore >= 40 ? 'text-amber-600' : 'text-red-600'}
                large
              />
            </div>
            <DetailRow label="Document" value={drawer.context.documentName} />
            <DetailRow label="Analyzed" value={drawer.context.date ? new Date(drawer.context.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />
            <div className="mt-6">
              <button
                onClick={() => { closeDrawer(); setActiveView('history'); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
              >
                <Eye size={16} /> View Full Analysis
              </button>
            </div>
          </>
        )}
      </DetailDrawer>

      {/* Chat Usage Drawer */}
      <DetailDrawer
        open={drawer.open && drawer.type === 'chatUsage'}
        onClose={closeDrawer}
        title="AI Consultation Analytics"
        subtitle="Detailed regulatory AI chat interaction metrics"
        icon={<MessageSquare size={20} />}
        breadcrumb={[{ label: 'Dashboard' }, { label: 'AI Consultation' }]}
      >
        {chatUsage && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <DetailStat label="Total Conversations" value={chatUsage.totalConversations} color="text-blue-600" />
              <DetailStat label="Total Messages" value={chatUsage.totalMessages} color="text-indigo-600" />
              <DetailStat label="Your Questions" value={chatUsage.userMessages} />
              <DetailStat label="AI Responses" value={chatUsage.assistantMessages} />
            </div>
            <DetailRow label="Avg Messages / Conversation" value={chatUsage.avgMessagesPerConversation} />
            <DetailRow label="Total Citations Retrieved" value={chatUsage.totalCitations} />
            <DetailRow label="Avg Citations / Response" value={chatUsage.avgCitationsPerResponse} />
            {chatUsage.mostActiveDocument && (
              <DetailRow label="Most Active Document" value={chatUsage.mostActiveDocument} />
            )}
            <DetailSection title="Citation Quality" className="mt-6">
              <div className={cn(
                'rounded-xl p-4 border',
                chatUsage.avgCitationsPerResponse >= 3 ? 'bg-green-50 border-green-200' :
                chatUsage.avgCitationsPerResponse >= 1 ? 'bg-amber-50 border-amber-200' :
                'bg-red-50 border-red-200'
              )}>
                <p className="text-sm font-medium mb-1">
                  {chatUsage.avgCitationsPerResponse >= 3 ? '✅ Excellent Retrieval Quality' :
                   chatUsage.avgCitationsPerResponse >= 1 ? '⚠️ Moderate Retrieval Quality' :
                   '🔴 Low Retrieval Quality'}
                </p>
                <p className="text-xs text-slate-500">
                  {chatUsage.avgCitationsPerResponse >= 3
                    ? 'AI responses are well-grounded with multiple knowledge base references. Great factual reliability.'
                    : chatUsage.avgCitationsPerResponse >= 1
                      ? 'Responses have some grounding but could benefit from more KB content or more specific questions.'
                      : 'AI responses have limited KB grounding. Consider uploading more reference documents to the Knowledge Base.'}
                </p>
              </div>
            </DetailSection>
            <DetailSection title="What This Means" className="mt-4">
              <div className="space-y-3 text-xs text-slate-500 leading-relaxed">
                <p><strong className="text-slate-700">Conversations:</strong> Each time you start a new chat session about a document.</p>
                <p><strong className="text-slate-700">Citations:</strong> References from the Knowledge Base that the AI uses to ground its answers. Higher = more reliable responses.</p>
                <p><strong className="text-slate-700">Most Active:</strong> The document you've asked the most questions about through RAG chat.</p>
              </div>
            </DetailSection>
          </>
        )}
      </DetailDrawer>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   Sub-Components
   ════════════════════════════════════════════════════════════════ */

function SummaryCard({ label, value, icon, color, subtitle, isScore, tooltip, onClick }) {
  const displayValue = useCountUp(Math.round(value || 0), 800);
  const [showTip, setShowTip] = useState(false);
  const colorMap = {
    brand: 'from-brand-500 to-brand-600',
    indigo: 'from-indigo-500 to-indigo-600',
    green: 'from-green-500 to-emerald-600',
    amber: 'from-amber-500 to-orange-500',
    red: 'from-red-500 to-rose-600',
    orange: 'from-orange-500 to-amber-600',
    slate: 'from-slate-500 to-slate-600',
  };
  const bgMap = {
    brand: 'bg-brand-50 text-brand-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 transition-all group relative',
        onClick ? 'cursor-pointer hover:shadow-md hover:border-brand-200 hover:-translate-y-0.5' : 'hover:shadow-md'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', bgMap[color] || bgMap.brand)}>
          {icon}
        </div>
        <div className="flex items-center gap-1.5">
          {onClick && <ChevronRight size={12} className="text-slate-300 group-hover:text-brand-500 transition-colors" />}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{subtitle}</span>
          {tooltip && (
            <div className="relative">
              <button onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                <HelpCircle size={12} />
              </button>
              {showTip && (
                <div className="absolute right-0 top-full mt-2 w-56 p-3 bg-slate-900 text-white text-[11px] leading-relaxed rounded-xl shadow-xl z-50 pointer-events-none">
                  {tooltip}
                  <div className="absolute -top-1 right-3 w-2 h-2 bg-slate-900 rotate-45" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums">
        {isScore ? `${displayValue}%` : displayValue}
      </div>
      <div className="text-xs text-slate-400 mt-1 font-medium">{label}</div>
    </div>
  );
}


function RiskDistributionChart({ distribution, total, onBarClick }) {
  const items = [
    { key: 'critical', label: 'Critical', color: 'bg-red-500', count: distribution.critical || 0 },
    { key: 'high', label: 'High', color: 'bg-orange-500', count: distribution.high || 0 },
    { key: 'medium', label: 'Medium', color: 'bg-amber-400', count: distribution.medium || 0 },
    { key: 'low', label: 'Low', color: 'bg-green-500', count: distribution.low || 0 },
  ];
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  if (total === 0) {
    return (
      <div className="text-center py-6">
        <BarChart3 size={28} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">No findings data yet</p>
        <p className="text-xs text-slate-300 mt-1">Run an analysis to see risk distribution</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key} className={cn('flex items-center gap-3', onBarClick && item.count > 0 && 'cursor-pointer group')} onClick={() => onBarClick && item.count > 0 && onBarClick(item.key)}>
          <span className="text-xs font-medium text-slate-500 w-14 text-right group-hover:text-brand-600 transition-colors">{item.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700 ease-out', item.color)}
              style={{ width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%` }}
            />
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


function ScoreOverview({ regScore, payScore, totalAnalyses }) {
  if (totalAnalyses === 0) {
    return (
      <div className="text-center py-6">
        <TrendingUp size={28} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">No analyses yet</p>
        <p className="text-xs text-slate-300 mt-1">Scores will appear after your first analysis</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Regulatory Score */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Regulatory Compliance</span>
          </div>
          <span className={cn(
            'text-lg font-bold tabular-nums',
            regScore >= 60 ? 'text-green-600' : regScore >= 40 ? 'text-amber-600' : 'text-red-600'
          )}>
            {Math.round(regScore)}%
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-out',
              regScore >= 60 ? 'bg-gradient-to-r from-green-400 to-green-500' :
              regScore >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
              'bg-gradient-to-r from-red-400 to-red-500'
            )}
            style={{ width: `${Math.min(regScore, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {regScore >= 60 ? 'Acceptable — minor revisions may be needed' :
           regScore >= 40 ? 'Moderate risk — several issues to address' :
           'High risk — significant regulatory concerns detected'}
        </p>
      </div>

      {/* Payer Score */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BadgeDollarSign size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Payer Readiness</span>
          </div>
          <span className={cn(
            'text-lg font-bold tabular-nums',
            payScore >= 60 ? 'text-green-600' : payScore >= 40 ? 'text-amber-600' : 'text-red-600'
          )}>
            {Math.round(payScore)}%
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-out',
              payScore >= 60 ? 'bg-gradient-to-r from-green-400 to-emerald-500' :
              payScore >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
              'bg-gradient-to-r from-red-400 to-red-500'
            )}
            style={{ width: `${Math.min(payScore, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {payScore >= 60 ? 'Strong payer alignment — reimbursement likely' :
           payScore >= 40 ? 'Moderate viability — cost concerns flagged' :
           'Low viability — significant payer objections expected'}
        </p>
      </div>

      {/* Summary */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Based on</span>
          <span className="text-xs font-semibold text-slate-600">{totalAnalyses} {totalAnalyses === 1 ? 'analysis' : 'analyses'}</span>
        </div>
      </div>
    </div>
  );
}


function AttentionCard({ item, onViewAnalysis }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100 hover:border-red-200 transition-colors group cursor-pointer"
      onClick={onViewAnalysis}>
      <div className="h-9 w-9 bg-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0">
        <AlertTriangle size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">{item.documentName}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-bold text-red-600">Reg: {Math.round(item.regulatorScore)}%</span>
          {item.criticalCount > 0 && (
            <span className="text-[10px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
              {item.criticalCount} critical
            </span>
          )}
          {item.highCount > 0 && (
            <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
              {item.highCount} high
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-300 group-hover:text-red-400 transition-colors shrink-0" />
    </div>
  );
}


function ActivityItem({ item, onClick }) {
  const statusIcon = {
    COMPLETE: <CheckCircle size={14} className="text-green-500" />,
    FAILED: <XCircle size={14} className="text-red-500" />,
    IN_PROGRESS: <Loader2 size={14} className="text-brand-500 animate-spin" />,
    QUEUED: <Clock size={14} className="text-amber-500" />,
  };
  const typeIcon = {
    ANALYZE_DOCUMENT: <BarChart3 size={14} className="text-brand-500" />,
    KB_SYNC: <RefreshCw size={14} className="text-purple-500" />,
    SYNTHETIC_GENERATION: <Zap size={14} className="text-amber-500" />,
  };

  const timeAgo = item.createdAt ? formatTimeAgo(item.createdAt) : '';

  return (
    <div className={cn('flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-slate-50 transition-colors', onClick && 'cursor-pointer')} onClick={onClick}>
      <div className="shrink-0">
        {typeIcon[item.type] || <Activity size={14} className="text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-700 font-medium truncate">{item.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusIcon[item.status] || <Clock size={14} className="text-slate-300" />}
        <span className="text-[10px] text-slate-400 font-medium w-12 text-right">{timeAgo}</span>
      </div>
    </div>
  );
}


function formatTimeAgo(isoString) {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}


/* ── Shared Explanation Components ── */

function SectionExplainer({ title, description }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-brand-50/50 border border-brand-100 rounded-xl px-4 py-2.5 hover:bg-brand-50 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <Info size={14} className="text-brand-500 shrink-0" />
        <span className="text-xs font-semibold text-brand-700">{title}</span>
        <span className="text-[10px] text-brand-400 ml-1">— click to {expanded ? 'hide' : 'learn more'}</span>
        <ChevronDown size={12} className={cn('text-brand-400 ml-auto transition-transform', expanded && 'rotate-180')} />
      </div>
      {expanded && (
        <p className="text-[11px] text-brand-600/80 leading-relaxed mt-2 pl-5">{description}</p>
      )}
    </button>
  );
}

function InfoBanner({ text }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mb-4">
      <button onClick={() => setShow(!show)} className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors">
        <HelpCircle size={11} />
        <span>{show ? 'Hide explanation' : 'What does this mean?'}</span>
      </button>
      {show && (
        <div className="mt-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[11px] text-slate-500 leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}

function formatJobType(type) {
  const map = { ANALYZE_DOCUMENT: 'Protocol Analysis', KB_SYNC: 'Reference Library Sync', SYNTHETIC_GENERATION: 'Synthetic Generation' };
  return map[type] || type || 'Unknown';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
