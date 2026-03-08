import React, { useState } from 'react';
import { Wand2, Loader2, ArrowRight, CheckCircle, Copy, Check, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import GuidelineRefBadge from './GuidelineRefBadge';
import CacheStatusBanner from './CacheStatusBanner';
import { cn } from '../utils/cn';

export default function ProtocolOptimizer({ docId, generatedAt }) {
  const optimization = useAppStore(s => s.optimization);
  const isLoading = useAppStore(s => s.isOptimizing);
  const setOpt = useAppStore(s => s.setOptimization);
  const setLoading = useAppStore(s => s.setIsOptimizing);
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState(null);

  const optimize = async () => {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await strategicService.optimizeProtocol(docId);
      setOpt(result);
      useAppStore.getState().updateStrategicTimestamp('optimization', new Date().toISOString());
    } catch (err) {
      console.error('Optimize failed:', err);
      const msg = err?.response?.data?.detail || err?.userMessage || 'Failed to generate optimizations. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for non-HTTPS or permission-denied contexts
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-purple-500 animate-spin" />
          <Wand2 size={20} className="absolute inset-0 m-auto text-purple-600" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Generating Protocol Rewrites</h3>
        <p className="text-slate-400 text-sm">Creating specific text changes to resolve each finding...</p>
      </div>
    );
  }

  if (!optimization) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-20 w-20 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Wand2 size={28} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-bold mb-1">Protocol Rewrite Suggestions</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-4">Generate specific protocol text rewrites for each finding — with original text, improved text, and the exact guideline citation justifying each change.</p>
        {error && (
          <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 max-w-sm">
            <div className="flex items-center gap-1.5 font-semibold mb-0.5"><AlertTriangle size={12} /> Optimization Failed</div>
            {error}
          </div>
        )}
        <button onClick={optimize} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          Generate Optimizations
        </button>
      </div>
    );
  }

  const items = optimization.optimizations || [];
  const summary = optimization.summary || {};
  const sevConfig = {
    critical: 'border-l-red-500 bg-red-50/30',
    high: 'border-l-orange-500 bg-orange-50/30',
    medium: 'border-l-amber-400 bg-amber-50/20',
    low: 'border-l-emerald-400 bg-emerald-50/20',
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Score Summary */}
      <div className="bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 size={16} />
          <span className="text-sm font-bold">Protocol Optimization Summary</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <div className="text-[10px] text-purple-200 uppercase">Current Scores</div>
            <div className="text-lg font-black">
              {summary.current_regulatory_score}<span className="text-xs font-normal text-purple-200"> reg</span>
              {' / '}
              {summary.current_payer_score}<span className="text-xs font-normal text-purple-200"> pay</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-purple-200 uppercase">After Optimization</div>
            <div className="text-lg font-black text-emerald-300">
              {summary.projected_regulatory_score}<span className="text-xs font-normal text-emerald-200"> reg</span>
              {' / '}
              {summary.projected_payer_score}<span className="text-xs font-normal text-emerald-200"> pay</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 text-xs text-purple-200">
          <span>{summary.total_optimizations || items.length} changes</span>
          <span>{summary.critical_fixes} critical</span>
          <span>{summary.high_fixes} high</span>
          {summary.net_cost_impact && <span>Cost: {summary.net_cost_impact}</span>}
        </div>
        {summary.executive_summary && <p className="text-xs text-purple-100 mt-2">{summary.executive_summary}</p>}
      </div>

      {/* Optimization Items */}
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div key={item.id} className={cn(
            'rounded-xl border border-l-4 bg-white transition-all hover:shadow-md cursor-pointer',
            sevConfig[item.severity] || sevConfig.medium
          )}>
            <div
              className="p-3"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{item.finding_id}</span>
                  <span className="text-xs font-bold text-slate-800">{item.finding_title}</span>
                </div>
                <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                  item.severity === 'critical' ? 'bg-red-100 text-red-700' :
                  item.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                  item.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                )}>
                  {item.severity}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">{item.change_summary}</p>
              <div className="flex gap-2 mt-1.5 text-[10px]">
                {item.projected_score_impact?.regulatory_delta && (
                  <span className="text-emerald-600 font-medium">Reg: {item.projected_score_impact.regulatory_delta}</span>
                )}
                {item.projected_score_impact?.payer_delta && (
                  <span className="text-brand-600 font-medium">Pay: {item.projected_score_impact.payer_delta}</span>
                )}
                {item.cost_impact && <span className="text-slate-500">{item.cost_impact}</span>}
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100 p-3 space-y-3 animate-fade-in">
                {/* Original Text */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-red-600 uppercase">Original Text</span>
                    <span className="text-[10px] text-slate-400">{item.section}</span>
                  </div>
                  <div className="p-2.5 bg-red-50 rounded-lg border border-red-100 text-[11px] text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">
                    {item.original_text}
                  </div>
                </div>

                {/* Optimized Text */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Optimized Text</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyText(item.optimized_text, item.id); }}
                      className="flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-700"
                    >
                      {copiedId === item.id ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                    </button>
                  </div>
                  <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 text-[11px] text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">
                    {item.optimized_text}
                  </div>
                </div>

                {/* Justification */}
                <div className="p-2 bg-brand-50 rounded-lg border border-brand-100">
                  <div className="text-[10px] text-brand-600 font-bold mb-0.5">📋 Regulatory Justification</div>
                  <p className="text-[11px] text-slate-700">{item.regulatory_justification}</p>
                  {item.guideline_refs?.length > 0 && (
                    <GuidelineRefBadge refs={
                      item.guideline_refs.map(ref =>
                        typeof ref === 'string' ? { code: ref } : ref
                      )
                    } />
                  )}
                </div>

                {item.risk_level && (
                  <div className={cn('text-[10px] font-medium px-2 py-1 rounded',
                    item.risk_level === 'safe_change' ? 'bg-emerald-50 text-emerald-700' :
                    item.risk_level === 'needs_review' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  )}>
                    Risk: {item.risk_level.replace('_', ' ')}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <CacheStatusBanner
        generatedAt={generatedAt}
        onRegenerate={optimize}
        isLoading={isLoading}
        label="protocol optimization"
      />
    </div>
  );
}
