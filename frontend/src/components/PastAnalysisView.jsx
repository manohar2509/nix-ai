import React, { useState, useEffect } from 'react';
import {
  History, FileText, ShieldAlert, BadgeDollarSign, AlertTriangle,
  ChevronDown, ChevronRight, Search, Filter, CheckCircle, XCircle,
  AlertCircle, Clock, Eye, ArrowLeft, Download, BarChart3, Sparkles,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { analyticsService } from '../services/analyticsService';
import { cn } from '../utils/cn';

export default function PastAnalysisView() {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setCurrentDocument = useAppStore((s) => s.setCurrentDocument);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // date | regScore | payScore | findings

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyticsService.getAnalysisHistory();
      setAnalyses(result.analyses || []);
    } catch (err) {
      setError(err.message || 'Failed to load analysis history');
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to protocol view with this document selected
  const handleViewInProtocol = (analysis) => {
    setCurrentDocument({
      id: analysis.documentId,
      name: analysis.documentName,
      size: analysis.documentSize || 0,
      status: 'analyzed',
    });
    setActiveView('protocol');
  };

  // Filter & sort
  const filtered = analyses
    .filter((a) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!a.documentName?.toLowerCase().includes(q) && !a.summary?.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterSeverity !== 'all') {
        const counts = a.severityCounts || {};
        if (filterSeverity === 'critical' && !counts.critical) return false;
        if (filterSeverity === 'high' && !counts.high && !counts.critical) return false;
        if (filterSeverity === 'low-risk' && (counts.critical || counts.high)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'regScore': return a.regulatorScore - b.regulatorScore; // worst first
        case 'payScore': return a.payerScore - b.payerScore;
        case 'findings': return b.findingsCount - a.findingsCount;
        default: return (b.analyzedAt || '').localeCompare(a.analyzedAt || '');
      }
    });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-medium">Loading analysis history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <History size={24} className="text-brand-600" />
              Past Analyses
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'} across your protocols
            </p>
          </div>
          <button
            onClick={() => setActiveView('dashboard')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        {/* ── Search & Filter Bar ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by document name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-slate-400" />
              {['all', 'critical', 'high', 'low-risk'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(sev)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    filterSeverity === sev
                      ? sev === 'critical' ? 'bg-red-100 text-red-700'
                        : sev === 'high' ? 'bg-orange-100 text-orange-700'
                        : sev === 'low-risk' ? 'bg-green-100 text-green-700'
                        : 'bg-brand-100 text-brand-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  {sev === 'all' ? 'All' : sev === 'low-risk' ? 'Low Risk' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="date">Sort: Newest</option>
              <option value="regScore">Sort: Lowest Reg Score</option>
              <option value="payScore">Sort: Lowest Payer Score</option>
              <option value="findings">Sort: Most Findings</option>
            </select>
          </div>
        </div>

        {/* ── Results ── */}
        {filtered.length === 0 ? (
          <EmptyHistory hasAnalyses={analyses.length > 0} setActiveView={setActiveView} />
        ) : (
          <div className="space-y-4">
            {filtered.map((analysis) => (
              <AnalysisCard
                key={analysis.id}
                analysis={analysis}
                isExpanded={expandedId === analysis.id}
                onToggle={() => setExpandedId(expandedId === analysis.id ? null : analysis.id)}
                onViewInProtocol={() => handleViewInProtocol(analysis)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   Sub-Components
   ════════════════════════════════════════════════════════════════ */

function AnalysisCard({ analysis, isExpanded, onToggle, onViewInProtocol }) {
  const regColor = analysis.regulatorScore >= 60 ? 'text-green-600' : analysis.regulatorScore >= 40 ? 'text-amber-600' : 'text-red-600';
  const payColor = analysis.payerScore >= 60 ? 'text-green-600' : analysis.payerScore >= 40 ? 'text-amber-600' : 'text-red-600';
  const sev = analysis.severityCounts || {};

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm transition-all duration-200',
      isExpanded ? 'border-brand-200 shadow-md' : 'border-slate-200/60 hover:border-slate-300 hover:shadow-md'
    )}>
      {/* Card Header */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Expand icon */}
        <div className="shrink-0 text-slate-300">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>

        {/* Doc info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={15} className="text-brand-500 shrink-0" />
            <h3 className="text-sm font-bold text-slate-800 truncate">{analysis.documentName}</h3>
            <StatusBadge status={analysis.status} />
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>{formatDate(analysis.analyzedAt)}</span>
            {analysis.extractionMethod && (
              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 text-[10px]">
                {analysis.extractionMethod}
              </span>
            )}
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-6 shrink-0">
          <ScorePill icon={<ShieldAlert size={13} />} label="Reg" value={analysis.regulatorScore} color={regColor} />
          <ScorePill icon={<BadgeDollarSign size={13} />} label="Payer" value={analysis.payerScore} color={payColor} />

          {/* Severity badges */}
          <div className="flex items-center gap-1">
            {sev.critical > 0 && <SeverityBadge severity="critical" count={sev.critical} />}
            {sev.high > 0 && <SeverityBadge severity="high" count={sev.high} />}
            {sev.medium > 0 && <SeverityBadge severity="medium" count={sev.medium} />}
            {sev.low > 0 && <SeverityBadge severity="low" count={sev.low} />}
          </div>

          {/* Total findings */}
          <div className="text-center">
            <div className="text-sm font-bold text-slate-700">{analysis.findingsCount}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wider">findings</div>
          </div>
        </div>
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t border-slate-100 animate-fade-in">
          {/* Summary */}
          {analysis.summary && (
            <div className="px-12 py-4 bg-slate-50/50 border-b border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Analysis Summary</h4>
              <p className="text-sm text-slate-600 leading-relaxed">{analysis.summary}</p>
            </div>
          )}

          {/* Score bars */}
          <div className="px-12 py-4 border-b border-slate-100">
            <div className="grid grid-cols-2 gap-6">
              <ScoreBar label="Regulatory Compliance" score={analysis.regulatorScore} />
              <ScoreBar label="Payer Viability" score={analysis.payerScore} />
            </div>
          </div>

          {/* Findings */}
          <div className="px-12 py-5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
              Findings ({analysis.findingsCount})
            </h4>
            {analysis.findings?.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {analysis.findings.map((finding, idx) => (
                  <FindingRow key={idx} finding={finding} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No detailed findings available</p>
            )}
          </div>

          {/* Actions */}
          <div className="px-12 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center gap-3">
            <button
              onClick={onViewInProtocol}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Eye size={14} />
              View in Protocol
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function ScorePill({ icon, label, value, color }) {
  return (
    <div className="text-center">
      <div className={cn('text-sm font-bold tabular-nums flex items-center gap-1 justify-center', color)}>
        {icon}
        {Math.round(value)}%
      </div>
      <div className="text-[9px] text-slate-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}


function ScoreBar({ label, score }) {
  const color = score >= 60
    ? 'from-green-400 to-green-500'
    : score >= 40
      ? 'from-amber-400 to-amber-500'
      : 'from-red-400 to-red-500';
  const textColor = score >= 60 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className={cn('text-sm font-bold tabular-nums', textColor)}>{Math.round(score)}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r', color)}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}


function StatusBadge({ status }) {
  const styles = {
    COMPLETE: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    QUEUED: 'bg-amber-100 text-amber-700',
  };
  const icons = {
    COMPLETE: <CheckCircle size={10} />,
    FAILED: <XCircle size={10} />,
    IN_PROGRESS: <Clock size={10} />,
    QUEUED: <Clock size={10} />,
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
      styles[status] || 'bg-slate-100 text-slate-500'
    )}>
      {icons[status]}
      {status?.toLowerCase() || 'unknown'}
    </span>
  );
}


function SeverityBadge({ severity, count }) {
  const colors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <span className={cn(
      'inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border',
      colors[severity] || 'bg-slate-100 text-slate-500 border-slate-200'
    )}>
      {count} {severity?.charAt(0).toUpperCase()}
    </span>
  );
}


function FindingRow({ finding }) {
  const sevColors = {
    critical: { bg: 'bg-red-50', border: 'border-red-100', icon: 'text-red-500', badge: 'bg-red-100 text-red-700' },
    high: { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'text-orange-500', badge: 'bg-orange-100 text-orange-700' },
    medium: { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
    low: { bg: 'bg-green-50', border: 'border-green-100', icon: 'text-green-500', badge: 'bg-green-100 text-green-700' },
  };
  const s = sevColors[finding.severity] || sevColors.medium;

  return (
    <div className={cn('p-3.5 rounded-xl border', s.bg, s.border)}>
      <div className="flex items-start gap-3">
        <AlertCircle size={15} className={cn('mt-0.5 shrink-0', s.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-800">{finding.title || 'Finding'}</span>
            <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded', s.badge)}>
              {finding.severity}
            </span>
            {finding.type && (
              <span className="text-[9px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {finding.type}
              </span>
            )}
            {finding.section && (
              <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {finding.section}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{finding.description}</p>
          {finding.suggestion && (
            <div className="mt-2 flex items-start gap-2 bg-white/50 rounded-lg p-2 border border-slate-100">
              <Sparkles size={12} className="text-brand-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-semibold text-brand-600">Suggestion:</span> {finding.suggestion}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function EmptyHistory({ hasAnalyses, setActiveView }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-16 text-center">
      <div className="h-20 w-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-slate-100">
        {hasAnalyses ? (
          <Search size={32} className="text-slate-300" />
        ) : (
          <BarChart3 size={32} className="text-slate-300" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">
        {hasAnalyses ? 'No matching analyses' : 'No analyses yet'}
      </h3>
      <p className="text-sm text-slate-400 max-w-[320px] mx-auto leading-relaxed mb-6">
        {hasAnalyses
          ? 'Try adjusting your search or filter criteria'
          : 'Upload a clinical protocol and run your first adversarial analysis to see results here'}
      </p>
      {!hasAnalyses && (
        <button
          onClick={() => setActiveView('protocol')}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Sparkles size={16} />
          Start First Analysis
        </button>
      )}
    </div>
  );
}


function formatDate(isoString) {
  if (!isoString) return 'Unknown date';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
