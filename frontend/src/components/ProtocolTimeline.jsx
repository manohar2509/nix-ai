/**
 * ProtocolTimeline — REQ-4: Regulatory Risk Timeline / Audit Trail
 *
 * Vertical timeline showing all regulatory events for a document:
 * uploads, analyses, simulations, chat milestones.
 */

import { useState, useEffect } from 'react';
import { useAppStore, useRegulatory } from '../stores/useAppStore';
import { getTimeline } from '../services/regulatoryService';

const EVENT_ICONS = {
  upload: '📄',
  analysis: '🔬',
  simulation: '⚡',
  chat: '💬',
  comparison: '🔀',
  report: '📋',
};

const EVENT_COLORS = {
  upload: 'border-blue-500 bg-blue-500/20',
  analysis: 'border-emerald-500 bg-emerald-500/20',
  simulation: 'border-purple-500 bg-purple-500/20',
  chat: 'border-cyan-500 bg-cyan-500/20',
  comparison: 'border-amber-500 bg-amber-500/20',
  report: 'border-pink-500 bg-pink-500/20',
};

export default function ProtocolTimeline({ docId }) {
  const { timeline } = useRegulatory();
  const store = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (docId) loadTimeline();
  }, [docId]);

  const loadTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTimeline(docId);
      store.setTimeline(data.events || []);
    } catch (err) {
      console.error('Failed to load timeline:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-500 border-t-transparent" />
        <span className="ml-2 text-sm text-slate-500">Loading timeline...</span>
      </div>
    );
  }

  if (!timeline.length) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 text-left">
            <div className="font-semibold mb-0.5">⚠️ Failed to load timeline</div>
            <p>{error}</p>
            <button
              onClick={loadTimeline}
              className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {!error && <p>No timeline events yet.</p>}
        <p className="text-xs mt-1 text-slate-400">Upload and analyze a protocol to see events.</p>
        <div className="mt-3 p-3 rounded-lg bg-brand-50/60 border border-brand-100/60 text-left">
          <div className="text-[11px] font-semibold text-brand-700 mb-1">📋 About the Activity Log</div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            This timeline provides a complete GCP-compliant audit trail of all regulatory activities on your protocol. 
            Every upload, analysis, amendment simulation, protocol comparison, and report generation is logged with timestamps 
            and metadata — supporting 21 CFR Part 11 and ICH E6(R2) traceability requirements for regulatory inspections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-1">
        Regulatory Audit Trail ({timeline.length} events)
      </div>
      <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
        Complete chronological record of all protocol activities. This log supports regulatory inspection readiness per ICH E6(R2) and 21 CFR Part 11.
      </p>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />

        {timeline.map((event, i) => (
          <TimelineEvent key={i} event={event} isLast={i === timeline.length - 1} />
        ))}
      </div>
    </div>
  );
}

function TimelineEvent({ event, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = EVENT_COLORS[event.type] || EVENT_COLORS.upload;

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      const date = new Date(ts);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className={`relative flex gap-3 ${isLast ? '' : 'pb-4'}`}>
      {/* Dot */}
      <div className={`relative z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${colorClass}`}>
        {EVENT_ICONS[event.type] || '•'}
      </div>

      {/* Content */}
      <div
        className="flex-1 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800 group-hover:text-brand-600 transition-colors">
            {event.title}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0 ml-2">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>

        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.description}</p>

        {/* Expanded data */}
        {expanded && event.data && (
          <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 animate-in slide-in-from-top-1">
            {Object.entries(event.data).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-slate-500">{key.replace(/_/g, ' ')}:</span>
                <span className="text-slate-700">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
