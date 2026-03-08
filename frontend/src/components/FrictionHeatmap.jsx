import React, { useState } from 'react';
import { Flame, Loader2, AlertTriangle, Shield, DollarSign, Zap, Info } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import GuidelineRefBadge from './GuidelineRefBadge';
import CacheStatusBanner from './CacheStatusBanner';
import { cn } from '../utils/cn';

const riskColors = {
  high_friction: { bg: 'bg-red-500', bar: 'bg-red-400', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: 'High Friction' },
  regulatory_concern: { bg: 'bg-orange-500', bar: 'bg-orange-400', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', label: 'Regulatory Risk' },
  commercial_concern: { bg: 'bg-amber-500', bar: 'bg-amber-400', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', label: 'Commercial Risk' },
  low_risk: { bg: 'bg-emerald-500', bar: 'bg-emerald-400', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', label: 'Low Risk' },
};

function RiskBar({ value, color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-8 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[11px] font-bold text-slate-700 w-7 text-right">{value}</span>
    </div>
  );
}

export default function FrictionHeatmap({ docId, generatedAt }) {
  const frictionMap = useAppStore(s => s.frictionMap);
  const isLoading = useAppStore(s => s.isFrictionLoading);
  const setFriction = useAppStore(s => s.setFrictionMap);
  const setLoading = useAppStore(s => s.setIsFrictionLoading);
  const [selectedSection, setSelectedSection] = useState(null);
  const [error, setError] = useState(null);

  const generate = async () => {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await strategicService.getFrictionMap(docId);
      setFriction(result);
      useAppStore.getState().updateStrategicTimestamp('friction_map', new Date().toISOString());
    } catch (err) {
      console.error('Friction map failed:', err);
      const msg = err?.response?.data?.detail || err?.userMessage || 'Failed to generate friction map. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-red-500 animate-spin" />
          <Flame size={20} className="absolute inset-0 m-auto text-red-500" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Mapping Protocol Friction</h3>
        <p className="text-slate-400 text-sm">Analyzing regulatory vs commercial tensions across protocol sections...</p>
      </div>
    );
  }

  if (!frictionMap) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-20 w-20 bg-gradient-to-br from-red-50 to-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Flame size={28} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-bold mb-1">Regulatory vs. Commercial Conflict Map</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-4">Identify protocol sections where regulatory requirements and commercial objectives pull in opposite directions — and find the best resolution path.</p>
        {error && (
          <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 max-w-sm">
            <div className="flex items-center gap-1.5 font-semibold mb-0.5"><AlertTriangle size={12} /> Generation Failed</div>
            {error}
          </div>
        )}
        <button onClick={generate} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          Generate Friction Map
        </button>
      </div>
    );
  }

  const sections = frictionMap.sections || [];
  const overall = frictionMap.overall_friction || {};
  const selected = sections.find(s => s.section_id === selectedSection);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Overall Score */}
      <div className={cn(
        'rounded-xl p-4 border',
        overall.score > 60 ? 'bg-red-50 border-red-200' : overall.score > 30 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Flame size={16} className={overall.score > 60 ? 'text-red-500' : overall.score > 30 ? 'text-amber-500' : 'text-emerald-500'} />
            <span className="text-sm font-bold text-slate-800">Overall Protocol Conflict Score</span>
          </div>
          <span className={cn('text-2xl font-black', overall.score > 60 ? 'text-red-600' : overall.score > 30 ? 'text-amber-600' : 'text-emerald-600')}>
            {overall.score}<span className="text-sm font-normal text-slate-400">/100</span>
          </span>
        </div>
        <p className="text-xs text-slate-600">{overall.summary}</p>
        {overall.hotspots?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {overall.hotspots.map((h, i) => (
              <span key={i} className="text-[10px] bg-white/80 text-red-700 px-2 py-0.5 rounded-full border border-red-200 font-medium">🔥 {h}</span>
            ))}
          </div>
        )}
      </div>

      {/* Section Heatmap Grid */}
      <div className="flex items-center gap-4 px-1 py-1.5 text-[10px] text-slate-500 bg-slate-50 rounded-lg border border-slate-100">
        <span className="font-semibold text-slate-600">Score key:</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Reg = Regulatory Risk</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Com = Commercial Risk</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Gap = Conflict Score (higher = harder to resolve)</span>
      </div>
      <div className="grid gap-2">
        {sections.map((section) => {
          const rc = riskColors[section.risk_category] || riskColors.low_risk;
          const isSelected = selectedSection === section.section_id;
          return (
            <div
              key={section.section_id}
              onClick={() => setSelectedSection(isSelected ? null : section.section_id)}
              className={cn(
                'rounded-lg border cursor-pointer transition-all hover:shadow-md',
                isSelected ? 'border-brand-300 shadow-md ring-1 ring-brand-200' : 'border-slate-200 bg-white'
              )}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {section.section_number && <span className="text-[10px] text-slate-400 font-mono">{section.section_number}</span>}
                    <span className="text-xs font-bold text-slate-800">{section.section_title}</span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase', rc.badge)}>{rc.label}</span>
                  </div>
                  <span className={cn('text-lg font-black', section.friction_score > 60 ? 'text-red-600' : section.friction_score > 30 ? 'text-amber-600' : 'text-emerald-600')}>
                    {section.friction_score}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <RiskBar value={section.regulatory_risk} color="bg-red-400" label="Reg" />
                  <RiskBar value={section.commercial_risk} color="bg-amber-400" label="Com" />
                  <RiskBar value={section.friction_score} color="bg-purple-400" label="Gap" />
                </div>

                {isSelected && (
                  <div className="mt-3 space-y-2 pt-3 border-t border-slate-100 animate-fade-in">
                    {section.regulatory_detail && (
                      <div className="flex gap-2"><Shield size={12} className="mt-0.5 text-red-500 shrink-0" /><p className="text-[11px] text-slate-600">{section.regulatory_detail}</p></div>
                    )}
                    {section.commercial_detail && (
                      <div className="flex gap-2"><DollarSign size={12} className="mt-0.5 text-amber-500 shrink-0" /><p className="text-[11px] text-slate-600">{section.commercial_detail}</p></div>
                    )}
                    {section.friction_explanation && (
                      <div className="flex gap-2"><Zap size={12} className="mt-0.5 text-purple-500 shrink-0" /><p className="text-[11px] text-purple-700 font-medium">{section.friction_explanation}</p></div>
                    )}
                    {section.quick_fix && (
                      <div className="p-2 bg-brand-50 rounded border border-brand-100">
                        <div className="text-[10px] text-brand-600 font-bold mb-0.5">💡 Quick Fix</div>
                        <p className="text-[11px] text-slate-700">{section.quick_fix}</p>
                      </div>
                    )}
                    {section.guideline_refs?.length > 0 && (
                      <GuidelineRefBadge refs={
                        section.guideline_refs.map(ref =>
                          typeof ref === 'string' ? { code: ref } : ref
                        )
                      } />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CacheStatusBanner
        generatedAt={generatedAt}
        onRegenerate={generate}
        isLoading={isLoading}
        label="friction map"
      />
    </div>
  );
}
