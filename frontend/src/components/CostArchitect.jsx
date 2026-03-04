import React, { useState } from 'react';
import { Calculator, Loader2, TrendingDown, TrendingUp, DollarSign, ArrowRight, PieChart, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import { cn } from '../utils/cn';

function formatUSD(val) {
  if (!val && val !== 0) return '—';
  const num = Number(val);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

export default function CostArchitect({ docId }) {
  const costData = useAppStore(s => s.costAnalysis);
  const isLoading = useAppStore(s => s.isCostLoading);
  const setCost = useAppStore(s => s.setCostAnalysis);
  const setLoading = useAppStore(s => s.setIsCostLoading);
  const [tab, setTab] = useState('overview');

  const analyze = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const result = await strategicService.getCostAnalysis(docId);
      setCost(result);
    } catch (err) {
      console.error('Cost analysis failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-emerald-500 animate-spin" />
          <Calculator size={20} className="absolute inset-0 m-auto text-emerald-600" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Estimating Trial Costs</h3>
        <p className="text-slate-400 text-sm">Calculating per-patient costs, amendment risks, and optimization scenarios...</p>
      </div>
    );
  }

  if (!costData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-20 w-20 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Calculator size={28} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-bold mb-1">Trial Cost Architect</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-4">Estimate full trial costs, see per-finding cost impacts, and compare optimization scenarios — using real industry benchmarks.</p>
        <button onClick={analyze} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          Analyze Costs
        </button>
      </div>
    );
  }

  const params = costData.protocol_parameters || {};
  const estimate = costData.cost_estimate || {};
  const breakdown = costData.cost_breakdown || [];
  const impacts = costData.finding_cost_impacts || [];
  const amendment = costData.amendment_risk || {};
  const scenarios = costData.optimization_scenarios || [];
  const roi = costData.roi_summary || {};

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'breakdown', label: 'Breakdown' },
    { key: 'findings', label: `Finding Impacts (${impacts.length})` },
    { key: 'scenarios', label: 'Scenarios' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Total Cost Hero */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign size={18} />
          <span className="text-sm font-bold">Estimated Total Trial Cost</span>
        </div>
        <div className="text-3xl font-black">{formatUSD(estimate.total_estimated_cost_usd)}</div>
        <div className="text-emerald-200 text-xs mt-1">Range: {formatUSD(estimate.cost_range_low_usd)} – {formatUSD(estimate.cost_range_high_usd)}</div>
        <div className="flex gap-4 mt-3 text-xs">
          <div><span className="text-emerald-200">Per patient:</span> <span className="font-bold">{formatUSD(estimate.per_patient_cost_usd)}</span></div>
          <div><span className="text-emerald-200">Benchmark:</span> <span className="font-bold">{formatUSD(estimate.industry_benchmark_per_patient)}</span></div>
          {estimate.vs_benchmark && <div className="text-emerald-100 font-medium">{estimate.vs_benchmark}</div>}
        </div>
      </div>

      {/* Protocol Parameters */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Phase', value: params.phase },
          { label: 'Patients', value: params.target_enrollment },
          { label: 'Sites', value: params.number_of_sites },
          { label: 'Duration', value: `${params.study_duration_months}mo` },
        ].map(p => (
          <div key={p.label} className="bg-slate-50 rounded-lg p-2 border border-slate-200 text-center">
            <div className="text-[10px] text-slate-400 uppercase">{p.label}</div>
            <div className="text-sm font-bold text-slate-800">{p.value || '—'}</div>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors',
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {/* Amendment Risk */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-amber-600" />
              <span className="text-xs font-bold text-amber-800">Amendment Risk</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Predicted amendments: <span className="font-bold text-amber-700">{amendment.predicted_amendments}</span></div>
              <div>Estimated cost: <span className="font-bold text-amber-700">{formatUSD(amendment.estimated_amendment_cost_usd)}</span></div>
            </div>
            {amendment.high_risk_triggers?.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {amendment.high_risk_triggers.map((t, i) => (
                  <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1"><AlertTriangle size={10} className="mt-0.5 shrink-0" />{t}</li>
                ))}
              </ul>
            )}
          </div>
          {/* ROI */}
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={14} className="text-brand-600" />
              <span className="text-xs font-bold text-brand-800">NIX AI Value</span>
            </div>
            <div className="text-lg font-black text-brand-700">{formatUSD(roi.total_potential_savings_usd)}</div>
            <div className="text-[11px] text-slate-600">{roi.nix_ai_analysis_value}</div>
          </div>
        </div>
      )}

      {tab === 'breakdown' && (
        <div className="space-y-2">
          {breakdown.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-slate-600">{item.percentage}%</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-800">{item.category}</div>
                <div className="text-[11px] text-slate-500">{item.detail}</div>
              </div>
              <span className="text-sm font-bold text-slate-700 shrink-0">{formatUSD(item.estimated_cost_usd)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'findings' && (
        <div className="space-y-2">
          {impacts.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No finding cost impacts calculated.</p>}
          {impacts.map((impact, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{impact.finding_id}</span>
                  <span className="text-xs font-bold text-slate-800">{impact.finding_title}</span>
                </div>
                <span className={cn('text-sm font-bold', impact.cost_impact_direction === 'savings' ? 'text-emerald-600' : 'text-red-600')}>
                  {impact.cost_impact_direction === 'savings' ? '-' : '+'}{formatUSD(Math.abs(impact.cost_impact_usd))}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">{impact.explanation}</p>
              <div className="flex gap-3 mt-1.5 text-[10px]">
                {impact.timeline_impact_months > 0 && <span className="text-amber-600">⏱ +{impact.timeline_impact_months}mo delay</span>}
                {impact.fix_cost_usd > 0 && <span className="text-blue-600">🔧 Fix: {formatUSD(impact.fix_cost_usd)}</span>}
                {impact.roi_ratio && <span className="text-emerald-600">📈 ROI: {impact.roi_ratio}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'scenarios' && (
        <div className="space-y-2">
          {scenarios.map((s, i) => (
            <div key={i} className={cn(
              'p-3 rounded-lg border',
              i === 1 ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-200' : 'bg-white border-slate-200'
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800">{s.scenario}</span>
                <span className="text-lg font-black text-slate-800">{formatUSD(s.total_cost_usd)}</span>
              </div>
              <div className="flex gap-3 text-[10px] text-slate-500">
                <span>⏱ {s.timeline_months}mo</span>
                <span className={cn(
                  s.regulatory_risk === 'low' ? 'text-emerald-600' : s.regulatory_risk === 'elevated' ? 'text-red-600' : 'text-amber-600'
                )}>
                  Risk: {s.regulatory_risk}
                </span>
              </div>
              {s.changes?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {s.changes.map((c, j) => (
                    <li key={j} className="text-[11px] text-slate-600 flex items-start gap-1"><ArrowRight size={9} className="mt-1 shrink-0 text-brand-500" />{c}</li>
                  ))}
                </ul>
              )}
              {i === 1 && <div className="text-[10px] text-brand-600 font-bold mt-1.5">⭐ Recommended by NIX AI</div>}
            </div>
          ))}
        </div>
      )}

      <button onClick={analyze} className="w-full py-2 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
        Recalculate Costs
      </button>
    </div>
  );
}
