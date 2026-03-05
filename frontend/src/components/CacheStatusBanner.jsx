/**
 * CacheStatusBanner — Shows when AI-generated content was produced,
 * lets the user regenerate, and builds trust with clear provenance.
 *
 * Displayed at the bottom of each strategic intelligence panel to:
 *   1. Show users the result is stable (cached, not regenerated)
 *   2. Show when it was generated
 *   3. Allow explicit regeneration when the user wants fresh output
 */

import { Clock, RotateCcw, CheckCircle2 } from 'lucide-react';
import { cn } from '../utils/cn';

function formatTimestamp(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

export default function CacheStatusBanner({ generatedAt, onRegenerate, isLoading, label = 'result' }) {
  const timestamp = formatTimestamp(generatedAt);

  return (
    <div className={cn(
      'flex items-center justify-between px-3 py-2 rounded-lg border mt-4 transition-all',
      generatedAt
        ? 'bg-emerald-50/60 border-emerald-200/60'
        : 'bg-slate-50 border-slate-200/60'
    )}>
      <div className="flex items-center gap-2 text-[11px]">
        {generatedAt ? (
          <>
            <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
            <span className="text-slate-500">
              This {label} was generated{' '}
              <span className="font-semibold text-slate-700">{timestamp}</span>
              {' '}and is cached for consistency.
            </span>
          </>
        ) : (
          <>
            <Clock size={12} className="text-slate-400 shrink-0" />
            <span className="text-slate-400">Results will be cached after generation.</span>
          </>
        )}
      </div>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded transition-colors',
            isLoading
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-brand-600 hover:bg-brand-50 hover:text-brand-700'
          )}
          title={`Regenerate this ${label} with a fresh AI analysis`}
        >
          <RotateCcw size={10} className={cn(isLoading && 'animate-spin')} />
          Regenerate
        </button>
      )}
    </div>
  );
}
