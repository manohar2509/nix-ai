import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, BadgeDollarSign, Zap } from 'lucide-react';

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
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);

  return count;
}

export default function ConflictHeatmap({ regulatorScore = 42, payerScore = 88, findings = [] }) {
  const regScore = useCountUp(Math.round(regulatorScore), 1200);
  const payScore = useCountUp(Math.round(payerScore), 1200);
  const [barMounted, setBarMounted] = useState(false);

  // Derive risk label from score
  const regLabel = regulatorScore >= 70 ? 'Low Risk' : regulatorScore >= 40 ? 'Medium Risk' : 'High Risk';
  const payLabel = payerScore >= 70 ? 'Viable' : payerScore >= 40 ? 'Moderate' : 'Unlikely';

  // Find conflict sections from findings
  const conflictSections = findings
    .filter(f => f.type === 'conflict' || f.severity === 'high' || f.severity === 'critical')
    .map(f => f.section)
    .filter(Boolean);
  const conflictLabel = conflictSections.length > 0
    ? `Conflict at ${conflictSections[0]}`
    : 'No conflicts';

  useEffect(() => {
    const t = setTimeout(() => setBarMounted(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="bg-white border-b border-slate-100 p-6 space-y-6">
      {/* Score Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Regulator */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-risk-50 to-rose-50/50 border border-risk-100/80 relative overflow-hidden group transition-shadow hover:shadow-md">
          <div className="absolute -top-2 -right-2 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-300">
            <ShieldAlert size={56} className="text-risk-600" />
          </div>
          <div className="relative">
            <span className="text-[9px] font-bold text-risk-500 uppercase tracking-[0.2em]">Regulator</span>
            <div className="text-3xl font-black text-risk-900 mt-1 tabular-nums">
              {regScore}<span className="text-base font-normal text-risk-300">/100</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-risk-100 rounded-full mt-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-risk-400 to-risk-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: barMounted ? `${Math.round(regulatorScore)}%` : '0%' }}
              />
            </div>
            <span className="text-[10px] font-semibold text-risk-600 mt-1.5 block">{regLabel}</span>
          </div>
        </div>

        {/* Payer */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-money-50 to-emerald-50/50 border border-money-100/80 relative overflow-hidden group transition-shadow hover:shadow-md">
          <div className="absolute -top-2 -right-2 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-300">
            <BadgeDollarSign size={56} className="text-money-600" />
          </div>
          <div className="relative">
            <span className="text-[9px] font-bold text-money-500 uppercase tracking-[0.2em]">Payer</span>
            <div className="text-3xl font-black text-money-900 mt-1 tabular-nums">
              {payScore}<span className="text-base font-normal text-money-300">/100</span>
            </div>
            <div className="h-1.5 bg-money-100 rounded-full mt-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-money-400 to-money-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: barMounted ? `${Math.round(payerScore)}%` : '0%' }}
              />
            </div>
            <span className="text-[10px] font-semibold text-money-600 mt-1.5 block">{payLabel}</span>
          </div>
        </div>
      </div>

      {/* Heatmap Bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Strategic Friction Heatmap</h3>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-risk-600">
            <Zap size={10} />
            {conflictLabel}
          </span>
        </div>

        {/* The Bar */}
        <div className="h-8 bg-slate-50 rounded-lg w-full relative overflow-hidden border border-slate-100">
          {/* Grid lines */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent, transparent 19%, #e2e8f0 19%, #e2e8f0 20%)',
              backgroundSize: '100px 100%',
            }}
          />

          {/* Dynamic zones based on scores */}
          {regulatorScore >= 60 && (
            <div className="absolute left-[5%] w-[25%] h-full bg-money-100/40 border-x border-money-200/30" />
          )}
          {payerScore >= 60 && (
            <div className="absolute left-[65%] w-[30%] h-full bg-money-100/40 border-x border-money-200/30" />
          )}

          {/* Conflict zones derived from findings */}
          {conflictSections.length > 0 && (
            <div
              className="absolute h-full bg-risk-500/15 border-x-2 border-risk-500/40 flex items-center justify-center"
              style={{
                left: `${Math.min(30 + conflictSections.length * 5, 70)}%`,
                width: `${Math.min(10 + conflictSections.length * 4, 25)}%`,
              }}
            >
              <div className="h-0.5 w-full bg-risk-500/60 animate-pulse-slow" />
            </div>
          )}

          {/* Section labels from findings */}
          {(conflictSections.length > 0
            ? conflictSections.slice(0, 5)
            : ['—']
          ).map((label, i) => (
            <div
              key={label + i}
              className="absolute top-0 h-full flex items-end pb-0.5 justify-center"
              style={{ left: `${10 + i * 18}%`, width: '20px' }}
            >
              <span className="text-[7px] font-mono text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1.5 px-1">
          <span>Low Risk</span>
          <span>High Risk</span>
        </div>
      </div>
    </div>
  );
}
