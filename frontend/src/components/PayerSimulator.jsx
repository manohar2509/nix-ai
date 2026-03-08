import React, { useState } from 'react';
import { CreditCard, Loader2, ShieldAlert, Building2, TrendingDown, DollarSign, ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import CacheStatusBanner from './CacheStatusBanner';
import { cn } from '../utils/cn';

function formatUSD(val) {
  if (!val && val !== 0) return '—';
  const num = Number(val);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

const decisionStyle = {
  'Cover': { color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
  'Cover with conditions': { color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle },
  'Restrict with PA': { color: 'text-orange-600', bg: 'bg-orange-50', icon: ShieldAlert },
  'Deny': { color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
};

export default function PayerSimulator({ docId, generatedAt }) {
  const sim = useAppStore(s => s.payerSimulation);
  const isLoading = useAppStore(s => s.isPayerSimLoading);
  const setSim = useAppStore(s => s.setPayerSimulation);
  const setLoading = useAppStore(s => s.setIsPayerSimLoading);
  const [tab, setTab] = useState('insurers');

  const simulate = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const result = await strategicService.simulatePayer(docId);
      setSim(result);
      useAppStore.getState().updateStrategicTimestamp('payer_simulation', new Date().toISOString());
    } catch (err) {
      console.error('Payer simulation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-violet-500 animate-spin" />
          <CreditCard size={20} className="absolute inset-0 m-auto text-violet-600" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Simulating Payer Decisions</h3>
        <p className="text-slate-400 text-sm">Running coverage models for US insurers and global HTA bodies...</p>
      </div>
    );
  }

  if (!sim) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-20 w-20 bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <CreditCard size={28} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-bold mb-1">Payer Coverage Forecast</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-4">Predict how UnitedHealthcare, Anthem, NICE, IQWiG and other major payers will evaluate your protocol — with denial probabilities and revenue-at-risk estimates.</p>
        <button onClick={simulate} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          Simulate Coverage Decisions
        </button>
      </div>
    );
  }

  const insurers = sim.insurer_predictions || [];
  const hta = sim.hta_predictions || [];
  const revenue = sim.revenue_impact || {};
  const fixes = sim.fix_package || [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Risk Summary */}
      <div className={cn(
        'rounded-xl p-4 border',
        sim.denial_risk_category === 'high' ? 'bg-red-50 border-red-200' : sim.denial_risk_category === 'moderate' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-500" />
            <span className="text-sm font-bold text-slate-800">Overall Denial Risk</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-red-600">{sim.overall_denial_risk_pct}%</span>
            <span className={cn('text-[10px] uppercase font-bold ml-2 px-2 py-0.5 rounded-full',
              sim.denial_risk_category === 'high' ? 'bg-red-100 text-red-700' :
              sim.denial_risk_category === 'moderate' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            )}>
              {sim.denial_risk_category}
            </span>
          </div>
        </div>
        {sim.executive_summary && <p className="text-xs text-slate-600">{sim.executive_summary}</p>}
      </div>

      {/* Revenue at Risk */}
      {revenue.revenue_at_risk_usd > 0 && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-4 text-white">
          <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Revenue at Risk</div>
          <div className="text-2xl font-black text-red-400">{formatUSD(revenue.revenue_at_risk_usd)}</div>
          <div className="flex gap-4 mt-2 text-xs text-slate-300">
            <div>Current: <span className="text-white font-bold">{formatUSD(revenue.current_protocol_revenue_projection_usd)}</span></div>
            <div>Optimized: <span className="text-emerald-400 font-bold">{formatUSD(revenue.optimized_protocol_revenue_projection_usd)}</span></div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {[
          { key: 'insurers', label: `US Insurers (${insurers.length})` },
          { key: 'hta', label: `HTA Bodies (${hta.length})` },
          { key: 'fixes', label: `Fix Package (${fixes.length})` },
        ].map(t => (
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

      {tab === 'insurers' && (
        <div className="space-y-2">
          {insurers.map((ins, i) => {
            const ds = decisionStyle[ins.predicted_coverage_decision] || decisionStyle['Restrict with PA'];
            const DecisionIcon = ds.icon;
            return (
              <div key={i} className={cn('p-3 rounded-lg border', ds.bg, 'border-slate-200')}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-800">{ins.insurer}</span>
                    <span className="text-[10px] text-slate-400">{ins.covered_lives_millions}M lives</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DecisionIcon size={14} className={ds.color} />
                    <span className={cn('text-[11px] font-bold', ds.color)}>{ins.predicted_coverage_decision}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-2 bg-white/50 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', ins.denial_probability_pct > 50 ? 'bg-red-400' : ins.denial_probability_pct > 25 ? 'bg-amber-400' : 'bg-emerald-400')}
                      style={{ width: `${ins.denial_probability_pct}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700">{ins.denial_probability_pct}% denial</span>
                </div>
                {ins.key_concerns?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ins.key_concerns.map((c, j) => (
                      <span key={j} className="text-[9px] bg-white/80 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{c}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-1.5 text-[10px] text-slate-500">
                  {ins.prior_auth_likely && <span className="bg-slate-100 px-1.5 py-0.5 rounded">PA Required</span>}
                  {ins.step_therapy_likely && <span className="bg-slate-100 px-1.5 py-0.5 rounded">Step Therapy</span>}
                  {ins.formulary_tier_prediction && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{ins.formulary_tier_prediction}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'hta' && (
        <div className="space-y-2">
          {hta.map((h, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">{h.body}</span>
                  <span className="text-[10px] text-slate-400">{h.country}</span>
                </div>
                <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full',
                  h.reimbursement_probability_pct > 60 ? 'bg-emerald-100 text-emerald-700' :
                  h.reimbursement_probability_pct > 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                )}>
                  {h.reimbursement_probability_pct}% approval
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mb-1">{h.predicted_recommendation}</p>
              {h.key_gaps?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {h.key_gaps.map((g, j) => <span key={j} className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{g}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'fixes' && (
        <div className="space-y-2">
          {fixes.map((fix, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800">{fix.action}</span>
                {fix.roi_ratio && <span className="text-xs font-bold text-emerald-600">{fix.roi_ratio} ROI</span>}
              </div>
              <div className="flex gap-3 text-[10px] text-slate-500">
                <span>Cost: <span className="font-bold text-slate-700">{formatUSD(fix.cost_to_implement_usd)}</span></span>
                <span>Revenue unlock: <span className="font-bold text-emerald-600">{formatUSD(fix.revenue_impact_usd)}</span></span>
                <span>Denial ↓ <span className="font-bold text-brand-600">{fix.denial_reduction_pct}%</span></span>
              </div>
              {fix.affected_insurers?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {fix.affected_insurers.map((a, j) => <span key={j} className="text-[9px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded">{a}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CacheStatusBanner
        generatedAt={generatedAt}
        onRegenerate={simulate}
        isLoading={isLoading}
        label="payer simulation"
      />
    </div>
  );
}
