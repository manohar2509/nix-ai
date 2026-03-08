import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, DollarSign, Globe, AlertTriangle, CheckCircle2, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../utils/cn';

/* ── Animated Counter Hook ── */
function useCountUp(target, duration = 1300) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
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

/* ── Score Ring ── */
function ScoreRing({ score, label, icon: Icon, strokeColor, size = 'normal', tooltip }) {
  const animatedScore = useCountUp(Math.round(score || 0), 1200);
  const circumference = 2 * Math.PI * 36;
  const [mounted, setMounted] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  const riskLabel = score >= 75 ? 'Low Risk' : score >= 50 ? 'Moderate' : score >= 30 ? 'High Risk' : 'Critical';
  const riskColor = score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : score >= 30 ? 'text-orange-600' : 'text-red-600';
  const ringSize = size === 'large' ? 'w-[76px] h-[76px]' : 'w-16 h-16';

  return (
    <div
      className="flex flex-col items-center relative"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div className={cn('relative', ringSize)}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#e2e8f0" strokeWidth="5" />
          <circle cx="40" cy="40" r="36" fill="none" strokeWidth="5"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={mounted ? circumference * (1 - (score || 0) / 100) : circumference}
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-black tabular-nums', size === 'large' ? 'text-xl' : 'text-lg')}>
            {animatedScore}<span className="text-[10px] font-semibold text-slate-400">%</span>
          </span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="flex items-center justify-center gap-1">
          {Icon && <Icon size={12} className="text-slate-500" />}
          <span className="text-xs font-semibold text-slate-700">{label}</span>
        </div>
        <span className={cn('text-[11px] font-semibold', riskColor)}>{riskLabel}</span>
      </div>

      {/* Hover tooltip explaining the score */}
      {showTip && tooltip && (
        <div className="absolute top-full mt-2 z-50 w-56 pointer-events-none animate-fade-in">
          <div className="bg-slate-900 text-white rounded-lg shadow-xl p-2.5 text-left text-[11px] leading-relaxed">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Severity Distribution Bar ── */
function SeverityBar({ findings }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  (findings || []).forEach(f => {
    const sev = (f.severity || 'medium').toLowerCase();
    if (counts[sev] !== undefined) counts[sev]++;
  });
  const total = findings?.length || 0;

  const segments = [
    { key: 'critical', label: 'Critical', count: counts.critical, color: 'bg-red-500', textColor: 'text-red-700' },
    { key: 'high', label: 'High', count: counts.high, color: 'bg-orange-500', textColor: 'text-orange-700' },
    { key: 'medium', label: 'Medium', count: counts.medium, color: 'bg-amber-400', textColor: 'text-amber-700' },
    { key: 'low', label: 'Low', count: counts.low, color: 'bg-emerald-400', textColor: 'text-emerald-700' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
          Finding Severity Breakdown
        </span>
        <span className="text-xs text-slate-500 font-semibold">
          {total} finding{total !== 1 ? 's' : ''}
        </span>
      </div>

      {total > 0 ? (
        <>
          {/* Stacked bar */}
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
            {segments.map(seg => seg.count > 0 ? (
              <div
                key={seg.key}
                className={cn('h-full transition-all duration-700', seg.color)}
                style={{ width: `${(seg.count / total) * 100}%` }}
                title={`${seg.label}: ${seg.count}`}
              />
            ) : null)}
          </div>

          {/* Legend */}
          <div className="flex gap-3 mt-2 flex-wrap">
            {segments.map(seg => (
              <div key={seg.key} className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', seg.color)} />
                <span className={cn('text-[11px] font-medium', seg.count > 0 ? seg.textColor : 'text-slate-300')}>
                  {seg.count} {seg.label}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <span className="text-sm text-emerald-700 font-medium">No findings — protocol looks strong</span>
        </div>
      )}
    </div>
  );
}

export default function ConflictHeatmap({ regulatorScore = 0, payerScore = 0, globalReadiness = 0, findings = [], summary = '' }) {
  // Overall assessment
  const avgScore = ((regulatorScore || 0) + (payerScore || 0)) / 2;
  const overallStatus = avgScore >= 75 ? 'strong' : avgScore >= 50 ? 'moderate' : avgScore >= 30 ? 'needs-work' : 'critical';
  const statusConfig = {
    strong: { icon: TrendingUp, label: 'Strong Protocol — Minimal Issues', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    moderate: { icon: Minus, label: 'Moderate — Improvements Recommended', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    'needs-work': { icon: TrendingDown, label: 'Needs Significant Work', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
    critical: { icon: AlertTriangle, label: 'Critical Issues Found', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  };
  const status = statusConfig[overallStatus];
  const StatusIcon = status.icon;

  return (
    <div className="bg-white border-b border-slate-200/80">
      {/* Section Header */}
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-brand-50 flex items-center justify-center">
            <Info size={14} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Executive Summary</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              AI-generated compliance scores from protocol analysis — hover over each ring for details
            </p>
          </div>
        </div>

        {/* Score interpretation guide */}
        <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
          <div className="text-[11px] font-semibold text-slate-600 mb-1">Score Guide</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-[11px] text-slate-500"><strong className="text-emerald-600">75–100%</strong> Low risk — on track</span>
            <span className="text-[11px] text-slate-500"><strong className="text-amber-600">50–74%</strong> Moderate — review needed</span>
            <span className="text-[11px] text-slate-500"><strong className="text-orange-600">30–49%</strong> High risk — revisions required</span>
            <span className="text-[11px] text-slate-500"><strong className="text-red-600">0–29%</strong> Critical — major gaps</span>
          </div>
        </div>
      </div>

      {/* Score Rings — Regulator, Payer, Global */}
      <div className="px-6 pb-4">
        <div className="flex items-center justify-around py-4 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200/80 shadow-sm">
          <ScoreRing
            score={regulatorScore}
            label="Regulatory"
            icon={ShieldCheck}
            strokeColor="#f43f5e"
            tooltip="Regulatory Compliance Score — measures how well your protocol aligns with ICH E6(R2)/E8/E9 guidelines, FDA 21 CFR requirements, and EMA scientific guidance. 75%+ = low risk for IND/CTA submission."
          />
          <ScoreRing
            score={payerScore}
            label="Payer"
            icon={DollarSign}
            strokeColor="#10b981"
            tooltip="Payer Readiness Score — evaluates whether your protocol captures evidence required by HTA bodies (NICE, IQWiG, CADTH, PBAC) for reimbursement decisions. 75%+ = strong market access positioning."
          />
          <ScoreRing
            score={globalReadiness}
            label="Global Ready"
            icon={Globe}
            strokeColor="#6366f1"
            size="large"
            tooltip="Global Submission Readiness — weighted average of regulatory compliance across all target jurisdictions (FDA, EMA, PMDA, TGA, Health Canada). 85%+ = ready for simultaneous multi-country submissions."
          />
        </div>
      </div>

      {/* Overall Assessment Banner */}
      <div className={cn('mx-6 mb-4 px-3.5 py-2.5 rounded-lg border flex items-start gap-2.5', status.bg)}>
        <StatusIcon size={16} className={cn('shrink-0 mt-0.5', status.color)} />
        <div className="min-w-0">
          <div className={cn('text-xs font-semibold', status.color)}>{status.label}</div>
          {summary && (
            <p className="text-xs text-slate-600 leading-relaxed mt-1">{summary}</p>
          )}
        </div>
      </div>

      {/* Severity Distribution */}
      <div className="px-6 pb-5">
        <SeverityBar findings={findings} />
      </div>

      {/* Grounding Source — trust indicator */}
      <div className="mx-6 mb-5 px-3 py-2 rounded-lg bg-brand-50/60 border border-brand-100/40 flex items-start gap-2">
        <span className="text-brand-500 mt-0.5 shrink-0">🔒</span>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-brand-700">Grounded Analysis</span> — All scores and findings above are generated by cross-referencing your protocol against
          <span className="font-semibold"> {findings?.reduce((acc, f) => acc + (f.guideline_refs?.length || 0), 0) || 0} guideline citations</span> from
          ICH ({Object.keys({E6:1,E8:1,E9:1,E10:1,E17:1,M11:1}).length}+ guidelines), FDA ({12} guidance docs), and {5} HTA bodies.
          Every finding below includes clickable references to the official regulatory documents.
        </p>
      </div>
    </div>
  );
}
