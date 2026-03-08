/**
 * PayerGapPanel — REQ-5: Payer Evidence Gap Analyzer
 *
 * Shows HTA body scores (NICE, IQWIG, CADTH, PBAC, AMNOG) and
 * lists specific evidence gaps with severity and recommendations.
 * Enhanced with detailed HTA body context, score interpretations,
 * and reimbursement strategy guidance for clinical/commercial users.
 */

import { useState, useEffect } from 'react';
import { useAppStore, useRegulatory, useAnalysis } from '../stores/useAppStore';
import { getPayerGaps } from '../services/regulatoryService';
import GuidelineRefBadge from './GuidelineRefBadge';
import { cn } from '../utils/cn';

const HTA_LABELS = {
  NICE: {
    name: 'NICE',
    fullName: 'National Institute for Health and Care Excellence',
    region: 'UK',
    color: 'bg-blue-500',
    description: 'Evaluates cost-effectiveness using QALYs. Requires comparative effectiveness data vs. standard of care. Key threshold: £20K-£30K per QALY.',
    keyRequirement: 'Robust comparator data, patient-reported outcomes (PROs), EQ-5D utility values',
    impact: 'NICE recommendation is required for NHS reimbursement across England & Wales (~67M population).',
  },
  IQWIG: {
    name: 'IQWiG',
    fullName: 'Institute for Quality and Efficiency in Health Care',
    region: 'Germany',
    color: 'bg-yellow-500',
    description: 'Assesses added therapeutic benefit vs. appropriate comparator. Rating scale: Major, Considerable, Minor, Non-quantifiable, None, Negative.',
    keyRequirement: 'Head-to-head RCT data vs. GBA-designated comparator, patient-relevant endpoints',
    impact: 'IQWiG assessment drives AMNOG price negotiation — directly affects launch pricing in the largest EU market.',
  },
  CADTH: {
    name: 'CADTH',
    fullName: 'Canadian Agency for Drugs and Technologies in Health',
    region: 'Canada',
    color: 'bg-red-500',
    description: 'Performs clinical and economic reviews. Uses pan-Canadian Oncology Drug Review (pCODR) for cancer drugs.',
    keyRequirement: 'Canadian-relevant subgroup data, budget impact analysis, pharmacoeconomic model',
    impact: 'CADTH recommendation informs provincial formulary decisions across all Canadian provinces.',
  },
  PBAC: {
    name: 'PBAC',
    fullName: 'Pharmaceutical Benefits Advisory Committee',
    region: 'Australia',
    color: 'bg-green-500',
    description: 'Cost-effectiveness review for Pharmaceutical Benefits Scheme (PBS) listing. Strict evidence requirements for clinical superiority claims.',
    keyRequirement: 'Cost-effectiveness analysis, indirect comparisons (NMA/ITC) if no head-to-head data',
    impact: 'PBAC recommendation mandatory for PBS listing. Rejection means no government reimbursement in Australia.',
  },
  AMNOG: {
    name: 'AMNOG',
    fullName: 'Act on the Reform of the Market for Medicinal Products',
    region: 'Germany',
    color: 'bg-orange-500',
    description: 'Regulates drug pricing via early benefit assessment within 3 months of launch. GBA determines added benefit level.',
    keyRequirement: 'Dossier demonstrating added benefit within 3 months of market authorization',
    impact: 'AMNOG rating determines reimbursement price ceiling. "No added benefit" = reference pricing.',
  },
};

const SEVERITY_STYLES = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  high: 'bg-orange-50 border-orange-200 text-orange-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

function getHTAScoreInterpretation(score) {
  if (score >= 80) return { label: 'Strong', desc: 'Protocol captures evidence needed for positive HTA recommendation', color: 'text-emerald-600' };
  if (score >= 60) return { label: 'Moderate', desc: 'Some evidence gaps — may affect reimbursement speed', color: 'text-amber-600' };
  if (score >= 40) return { label: 'Weak', desc: 'Significant gaps — high risk of delayed or negative HTA outcome', color: 'text-orange-600' };
  return { label: 'Critical', desc: 'Major deficiencies — unlikely to achieve positive reimbursement decision', color: 'text-red-600' };
}

export default function PayerGapPanel({ docId }) {
  const { payerGaps, htaBodyScores } = useRegulatory();
  const { lastAnalysis } = useAnalysis();
  const store = useAppStore();
  const [loading, setLoading] = useState(false);
  const [expandedGap, setExpandedGap] = useState(null);
  const [expandedHTA, setExpandedHTA] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (lastAnalysis?.payer_gaps?.length) {
      store.setPayerGaps(lastAnalysis.payer_gaps);
      store.setHtaBodyScores(lastAnalysis.hta_body_scores || {});
    } else if (docId) {
      loadPayerData();
    }
  }, [docId, lastAnalysis]);

  const loadPayerData = async () => {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPayerGaps(docId);
      store.setPayerGaps(data.payer_gaps || []);
      store.setHtaBodyScores(data.hta_body_scores || {});
    } catch (err) {
      console.error('Failed to load payer data:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load payer data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-500 border-t-transparent" />
        <span className="ml-2 text-sm text-slate-500">Loading HTA body & payer readiness analysis...</span>
      </div>
    );
  }

  if (error && Object.keys(htaBodyScores).length === 0 && !payerGaps.length) {
    return (
      <div className="text-center py-6">
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
          ⚠️ {error}
        </div>
        <p className="text-sm text-slate-500 mt-2">Unable to load HTA & payer data. Please try again.</p>
      </div>
    );
  }

  const hasScores = Object.keys(htaBodyScores).length > 0;
  const avgScore = hasScores 
    ? Math.round(Object.values(htaBodyScores).reduce((a, b) => a + b, 0) / Object.values(htaBodyScores).length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Score legend */}
      <div className="p-3 rounded-xl bg-brand-50/60 border border-brand-100/60">
        <div className="text-[11px] font-semibold text-brand-700 mb-1">💰 Understanding HTA Readiness Scores</div>
        <p className="text-[11px] text-slate-600 leading-relaxed mb-2">
          Each score indicates how well your protocol captures the evidence that specific HTA bodies need for a positive reimbursement recommendation. 
          Higher scores mean your trial design already addresses payer requirements — reducing time-to-market-access post-approval.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-slate-600"><strong>80–100%</strong> — Strong readiness</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[11px] text-slate-600"><strong>60–79%</strong> — Gaps to address</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[11px] text-slate-600"><strong>40–59%</strong> — Significant risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[11px] text-slate-600"><strong>0–39%</strong> — Critical deficiency</span>
          </div>
        </div>
      </div>

      {/* Overall payer readiness */}
      {hasScores && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Average Payer Readiness</span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{avgScore}%</div>
            </div>
            <div className={cn('text-xs font-semibold px-2 py-1 rounded-lg', getHTAScoreInterpretation(avgScore).color, 'bg-white border border-slate-200')}>
              {getHTAScoreInterpretation(avgScore).label}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{getHTAScoreInterpretation(avgScore).desc}</p>
        </div>
      )}

      {/* HTA Body Scorecard — clickable for details */}
      {hasScores && (
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-2">HTA Body Readiness — Click for Details</div>
          <div className="grid grid-cols-5 gap-1.5">
            {Object.entries(HTA_LABELS).map(([key, info]) => {
              const score = htaBodyScores[key] || 0;
              const interp = getHTAScoreInterpretation(score);
              const isExpanded = expandedHTA === key;
              return (
                <button
                  key={key}
                  onClick={() => setExpandedHTA(isExpanded ? null : key)}
                  className={cn(
                    'text-center p-2 rounded-xl bg-white border shadow-sm transition-all cursor-pointer hover:shadow-md',
                    isExpanded ? 'border-brand-300 ring-2 ring-brand-200' : 'border-slate-200'
                  )}
                  title={`${info.fullName} (${info.region}): ${score}% readiness — ${interp.label}`}
                >
                  <div className="text-lg font-bold text-slate-900">{score}<span className="text-[10px] text-slate-400">%</span></div>
                  <div className="text-[11px] text-slate-600 font-medium">{info.name}</div>
                  <div className="text-[11px] text-slate-400">{info.region}</div>
                  <div className={cn('text-[10px] font-semibold mt-0.5', interp.color)}>{interp.label}</div>
                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', info.color)}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded HTA Detail */}
          {expandedHTA && HTA_LABELS[expandedHTA] && (
            <div className="mt-2 p-3 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2 animate-fade-in">
              <div className="text-xs font-semibold text-slate-800">{HTA_LABELS[expandedHTA].fullName}</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{HTA_LABELS[expandedHTA].description}</p>
              <div className="text-[11px]">
                <span className="text-slate-500">Key requirement: </span>
                <span className="text-slate-700 font-medium">{HTA_LABELS[expandedHTA].keyRequirement}</span>
              </div>
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/60">
                <div className="text-[10px] text-amber-700 font-semibold mb-0.5">⚠️ Reimbursement Impact</div>
                <p className="text-[11px] text-slate-700">{HTA_LABELS[expandedHTA].impact}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence Gaps */}
      {payerGaps.length > 0 ? (
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-1">
            Evidence Gaps ({payerGaps.length})
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            These are specific areas where your protocol does not capture evidence required by HTA bodies. Addressing these during protocol design 
            is far more cost-effective than running separate post-hoc studies.
          </p>
          <div className="space-y-2">
            {payerGaps.map((gap, i) => (
              <div
                key={gap.id || i}
                className={cn(
                  'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md',
                  SEVERITY_STYLES[gap.severity] || SEVERITY_STYLES.medium
                )}
                onClick={() => setExpandedGap(expandedGap === i ? null : i)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {gap.hta_body}
                    </span>
                    <span className="text-xs font-medium">{gap.requirement?.slice(0, 60)}</span>
                  </div>
                  <span className="text-[11px] uppercase font-bold">{gap.severity}</span>
                </div>

                <p className="text-xs mt-1 opacity-80">{gap.gap_description}</p>

                {/* Expand hint */}
                {expandedGap !== i && (gap.recommendation || gap.impact_on_reimbursement) && (
                  <div className="text-[10px] text-brand-600 mt-1 font-semibold">Click for recommendation →</div>
                )}

                {expandedGap === i && (
                  <div className="mt-2 pt-2 border-t border-slate-200/50 space-y-2 animate-fade-in">
                    {gap.recommendation && (
                      <div className="p-2 rounded-lg bg-brand-50 border border-brand-100">
                        <div className="text-[10px] text-brand-600 font-semibold mb-0.5">💡 Recommendation</div>
                        <div className="text-xs text-slate-700 leading-relaxed">{gap.recommendation}</div>
                      </div>
                    )}
                    {gap.impact_on_reimbursement && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                        <div className="text-[10px] text-amber-600 font-semibold mb-0.5">💰 Reimbursement Impact</div>
                        <div className="text-xs text-slate-700 leading-relaxed">{gap.impact_on_reimbursement}</div>
                      </div>
                    )}
                    {/* Guideline citations for traceability */}
                    {gap.guideline_refs?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold mb-0.5">📋 Regulatory Basis</div>
                        <GuidelineRefBadge refs={gap.guideline_refs.map(r => typeof r === 'string' ? { code: r } : r)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-slate-500 text-sm">
          <p>No evidence gaps identified.</p>
          <p className="text-xs mt-1 text-slate-400">Run a regulatory analysis on your protocol to identify HTA body requirements and potential reimbursement barriers from NICE, IQWiG, CADTH, PBAC, and AMNOG.</p>
        </div>
      )}
    </div>
  );
}
