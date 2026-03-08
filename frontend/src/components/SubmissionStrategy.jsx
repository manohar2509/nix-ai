import React, { useState } from 'react';
import { Route, Loader2, Globe, ArrowRight, CheckCircle, AlertTriangle, Clock, Zap } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import CacheStatusBanner from './CacheStatusBanner';
import { cn } from '../utils/cn';

const flagMap = { FDA: '🇺🇸', EMA: '🇪🇺', PMDA: '🇯🇵', 'Health Canada': '🇨🇦', MHRA: '🇬🇧', NMPA: '🇨🇳', TGA: '🇦🇺' };

export default function SubmissionStrategy({ docId, generatedAt }) {
  const strategy = useAppStore(s => s.submissionStrategy);
  const isLoading = useAppStore(s => s.isStrategyLoading);
  const setStrategy = useAppStore(s => s.setSubmissionStrategy);
  const setLoading = useAppStore(s => s.setIsStrategyLoading);
  const [tab, setTab] = useState('order');

  const generate = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const result = await strategicService.getSubmissionStrategy(docId);
      setStrategy(result);
      useAppStore.getState().updateStrategicTimestamp('submission_strategy', new Date().toISOString());
    } catch (err) {
      console.error('Strategy failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-blue-500 animate-spin" />
          <Route size={20} className="absolute inset-0 m-auto text-blue-600" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Optimizing Submission Strategy</h3>
        <p className="text-slate-400 text-sm">Calculating optimal filing order across jurisdictions...</p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-20 w-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Route size={28} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-bold mb-1">Global Filing Strategy</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-4">Optimize your global filing order across FDA, EMA, PMDA and other agencies — with a unified "golden protocol" that satisfies all jurisdictions and identifies accelerated pathways.</p>
        <button onClick={generate} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          Generate Strategy
        </button>
      </div>
    );
  }

  const order = strategy.recommended_submission_order || [];
  const simFiling = strategy.simultaneous_filing_feasibility || {};
  const goldenChanges = strategy.golden_protocol_changes || [];
  const timeline = strategy.timeline_comparison || {};
  const pathways = strategy.pathway_recommendations || [];
  const gapMatrix = strategy.jurisdiction_gap_matrix || [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Timeline Comparison Hero */}
      {(timeline.current_sequential_months || timeline.optimized_parallel_months) && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} />
            <span className="text-sm font-bold">Time to Global Approval</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-blue-200 uppercase mb-0.5">Sequential (Current)</div>
              <div className="text-2xl font-black">{timeline.current_sequential_months} months</div>
            </div>
            <div>
              <div className="text-[10px] text-blue-200 uppercase mb-0.5">Optimized (Parallel)</div>
              <div className="text-2xl font-black text-emerald-300">{timeline.optimized_parallel_months} months</div>
            </div>
          </div>
          {timeline.time_saved_months > 0 && (
            <div className="mt-2 text-xs text-blue-200">
              ⚡ Save <span className="text-white font-bold">{timeline.time_saved_months} months</span> — {timeline.market_revenue_impact}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {[
          { key: 'order', label: 'Filing Order' },
          { key: 'golden', label: `Golden Protocol (${goldenChanges.length})` },
          { key: 'pathways', label: 'Fast Tracks' },
          { key: 'gaps', label: 'Gap Matrix' },
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

      {tab === 'order' && (
        <div className="space-y-2">
          {order.map((entry, i) => (
            <div key={i} className={cn(
              'p-3 rounded-lg border',
              i === 0 ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-200' : 'bg-white border-slate-200'
            )}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{flagMap[entry.jurisdiction] || '🏳️'}</span>
                  <span className="text-xs font-bold text-slate-800">{entry.jurisdiction}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{entry.recommended_pathway}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-brand-600">{entry.compliance_score}/100</span>
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                    i === 0 ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                  )}>
                    #{entry.rank}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 mb-1">{entry.rationale}</p>
              <div className="flex gap-2 text-[10px] text-slate-500">
                <span><Clock size={10} className="inline mr-0.5" />{entry.estimated_review_months}mo review</span>
                {entry.estimated_approval_date && <span>→ {entry.estimated_approval_date}</span>}
              </div>
              {entry.blockers_to_resolve?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {entry.blockers_to_resolve.map((b, j) => (
                    <span key={j} className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{b}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {simFiling.feasible && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800">Simultaneous Filing Possible</span>
              </div>
              <p className="text-[11px] text-slate-600">{simFiling.explanation}</p>
              {simFiling.recommended_simultaneous?.length > 0 && (
                <div className="flex gap-1.5 mt-1.5">
                  {simFiling.recommended_simultaneous.map((j, i) => (
                    <span key={i} className="text-[10px] bg-white text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                      {flagMap[j] || ''} {j}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'golden' && (
        <div className="space-y-2">
          {goldenChanges.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No golden protocol changes identified.</p>}
          {goldenChanges.map((change, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800">{change.change}</span>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded',
                  change.effort_level === 'low' ? 'bg-emerald-100 text-emerald-700' :
                  change.effort_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                )}>
                  {change.effort_level} effort
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">{change.regulatory_justification}</p>
              <div className="flex flex-wrap gap-1">
                {change.resolves_for?.map((j, k) => (
                  <span key={k} className="text-[9px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">{flagMap[j] || ''} {j}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'pathways' && (
        <div className="space-y-2">
          {pathways.map((p, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{flagMap[p.jurisdiction] || '🏳️'}</span>
                <span className="text-xs font-bold text-slate-800">{p.jurisdiction}</span>
              </div>
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className="text-slate-500 line-through">{p.standard_pathway}</span>
                <ArrowRight size={12} className="text-brand-500" />
                <span className="font-bold text-brand-600">{p.recommended_pathway}</span>
              </div>
              <p className="text-[11px] text-slate-500">{p.eligibility_rationale}</p>
              {p.timeline_benefit_months > 0 && (
                <div className="text-[10px] text-emerald-600 font-bold mt-1">⚡ Saves {p.timeline_benefit_months} months</div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'gaps' && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 text-slate-500 font-medium">Section</th>
                <th className="text-center py-2 px-1">🇺🇸 FDA</th>
                <th className="text-center py-2 px-1">🇪🇺 EMA</th>
                <th className="text-center py-2 px-1">🇯🇵 PMDA</th>
              </tr>
            </thead>
            <tbody>
              {gapMatrix.map((row, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 px-2 font-medium text-slate-700">{row.protocol_section}</td>
                  <td className="py-2 px-1 text-center">
                    {row.fda_status === 'compliant' ? <CheckCircle size={14} className="inline text-emerald-500" /> :
                     row.fda_status === 'gap' ? <AlertTriangle size={14} className="inline text-red-500" /> :
                     <AlertTriangle size={14} className="inline text-amber-500" />}
                  </td>
                  <td className="py-2 px-1 text-center">
                    {row.ema_status === 'compliant' ? <CheckCircle size={14} className="inline text-emerald-500" /> :
                     row.ema_status === 'gap' ? <AlertTriangle size={14} className="inline text-red-500" /> :
                     <AlertTriangle size={14} className="inline text-amber-500" />}
                  </td>
                  <td className="py-2 px-1 text-center">
                    {row.pmda_status === 'compliant' ? <CheckCircle size={14} className="inline text-emerald-500" /> :
                     row.pmda_status === 'gap' ? <AlertTriangle size={14} className="inline text-red-500" /> :
                     <AlertTriangle size={14} className="inline text-amber-500" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {strategy.executive_summary && (
        <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">{strategy.executive_summary}</p>
      )}

      <CacheStatusBanner
        generatedAt={generatedAt}
        onRegenerate={generate}
        isLoading={isLoading}
        label="submission strategy"
      />
    </div>
  );
}
