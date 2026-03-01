import React from 'react';
import { Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';
import { cn } from '../utils/cn';

export default function SmartPivotCard({ findings = [] }) {
  // Use the highest-severity finding as the friction
  const topFinding = findings.find(f => f.severity === 'critical' || f.severity === 'high') || null;

  // Don't render if there are no actionable findings
  if (!topFinding) {
    return null;
  }

  const frictionText = topFinding.description || topFinding.title || 'Issue detected in protocol.';
  const suggestionText = topFinding.suggestion
    || 'Review and address this finding to improve regulatory and payer alignment.';
  const confidenceScore = topFinding.confidence ? `${Math.round(topFinding.confidence)}%` : null;

  return (
    <div className="mx-6 mt-6">
      {/* Outer glow wrapper */}
      <div className="relative group">
        {/* Animated gradient glow behind the card */}
        <div className="absolute -inset-px bg-gradient-to-r from-brand-500 via-purple-500 to-brand-500 rounded-2xl opacity-15 group-hover:opacity-30 blur-sm transition-opacity duration-500" />

        <div className="relative bg-white rounded-xl border border-brand-100/80 shadow-xl shadow-brand-900/5 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-600 via-brand-600 to-purple-600 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-semibold text-xs uppercase tracking-wider">
              <Sparkles size={14} />
              Smart Pivot Recommendation
            </div>
            {confidenceScore && (
              <span className="text-[10px] bg-white/20 text-white px-2.5 py-0.5 rounded-full font-bold backdrop-blur-sm">
                {confidenceScore} CONFIDENCE
              </span>
            )}
          </div>

          <div className="p-5 space-y-5">
            {/* The Friction */}
            <div className="flex gap-3 pb-5 border-b border-slate-100">
              <div className="mt-0.5 shrink-0">
                <div className="h-6 w-6 rounded-lg bg-risk-100 flex items-center justify-center text-risk-600">
                  <AlertTriangle size={13} />
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1">The Friction</h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {frictionText}
                </p>
              </div>
            </div>

            {/* The Solution */}
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0">
                <div className="h-6 w-6 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600">
                  <TrendingUp size={13} />
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.15em] mb-1">Recommended Pivot</h4>
                <p className="text-sm text-slate-800 font-medium leading-relaxed mb-3">
                  {suggestionText}
                </p>

                {/* Severity indicator */}
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                    topFinding.severity === 'critical' ? 'bg-red-100 text-red-700'
                      : topFinding.severity === 'high' ? 'bg-orange-100 text-orange-700'
                      : 'bg-amber-100 text-amber-700'
                  )}>
                    {topFinding.severity}
                  </span>
                  {topFinding.type && (
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {topFinding.type}
                    </span>
                  )}
                  {topFinding.section && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {topFinding.section}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


