/**
 * JurisdictionCompass — REQ-2: Multi-Jurisdiction Regulatory Compass
 *
 * World-map style dashboard showing per-jurisdiction compliance scores.
 * Renders as a grid of jurisdiction cards with color-coded risk levels.
 * Enhanced with detailed country context, score explanations, and regulatory body info.
 */

import { useState, useEffect } from 'react';
import { useAppStore, useRegulatory, useAnalysis } from '../stores/useAppStore';
import { getJurisdictionScores } from '../services/regulatoryService';
import GuidelineRefBadge from './GuidelineRefBadge';
import { cn } from '../utils/cn';

const RISK_COLORS = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const RISK_BG = {
  low: 'bg-emerald-50 border-emerald-200',
  medium: 'bg-amber-50 border-amber-200',
  high: 'bg-orange-50 border-orange-200',
  critical: 'bg-red-50 border-red-200',
};

/* ── Jurisdiction metadata for clinical/regulatory context ── */
const JURISDICTION_META = {
  FDA: {
    fullName: 'U.S. Food and Drug Administration',
    country: 'United States',
    submissionType: 'IND (Investigational New Drug)',
    keyRegulations: '21 CFR Parts 312, 314; ICH E6(R2)',
    avgReviewTime: '30 days (IND), 10-12 months (NDA)',
    marketSize: 'Largest pharma market (~45% global revenue)',
    tip: 'FDA requires a 30-day IND safety review before first-in-human dosing. Ensure your CMC, preclinical, and protocol sections are complete.',
  },
  EMA: {
    fullName: 'European Medicines Agency',
    country: 'European Union (27 member states)',
    submissionType: 'CTA (Clinical Trial Application) per EU CTR 536/2014',
    keyRegulations: 'EU Clinical Trials Regulation 536/2014; ICH E6(R2)',
    avgReviewTime: '~60 days (CTA via CTIS portal)',
    marketSize: '2nd largest market (~25% global revenue)',
    tip: 'Since Jan 2023, all EU CTAs must go through the CTIS portal. Ensure your protocol addresses Member State-specific requirements.',
  },
  PMDA: {
    fullName: 'Pharmaceuticals and Medical Devices Agency',
    country: 'Japan',
    submissionType: 'CTN (Clinical Trial Notification)',
    keyRegulations: 'Japanese GCP (J-GCP); ICH E6; PMDA guidelines',
    avgReviewTime: '30 days (CTN)',
    marketSize: '3rd largest market (~8% global revenue)',
    tip: 'Japan requires ethnic bridging studies for foreign drugs. Consider Japanese-specific pharmacokinetic data requirements in your protocol.',
  },
  TGA: {
    fullName: 'Therapeutic Goods Administration',
    country: 'Australia',
    submissionType: 'CTN or CTA (Clinical Trial Notification/Approval)',
    keyRegulations: 'Therapeutic Goods Act 1989; ICH GCP',
    avgReviewTime: '~15 days (CTN pathway)',
    marketSize: 'Key market for early-phase and first-in-human trials',
    tip: 'Australia\'s CTN pathway is one of the fastest globally — commonly used for first-in-human studies before pivoting to larger markets.',
  },
  'Health Canada': {
    fullName: 'Health Canada / Health Products and Food Branch',
    country: 'Canada',
    submissionType: 'CTA (Clinical Trial Application)',
    keyRegulations: 'Food and Drug Regulations (C.05); ICH GCP',
    avgReviewTime: '30 days (CTA)',
    marketSize: 'Important bridging market for US/EU submissions',
    tip: 'Health Canada often aligns with FDA requirements but has distinct labelling and bilingual (EN/FR) documentation requirements.',
  },
  MHRA: {
    fullName: 'Medicines and Healthcare products Regulatory Agency',
    country: 'United Kingdom',
    submissionType: 'CTA (Clinical Trial Authorisation)',
    keyRegulations: 'UK Medicines for Human Use (CTs) Regulations 2004; UK GCP',
    avgReviewTime: '30 days (combined with REC)',
    marketSize: 'Key post-Brexit independent regulatory pathway',
    tip: 'Post-Brexit, MHRA now operates independently. UK-specific CTA required — no longer covered by EU CTA.',
  },
  ANVISA: {
    fullName: 'Agência Nacional de Vigilância Sanitária',
    country: 'Brazil',
    submissionType: 'Clinical Research Dossier',
    keyRegulations: 'RDC 9/2015; ICH GCP; CONEP Ethics',
    avgReviewTime: '90-180 days',
    marketSize: 'Largest market in Latin America',
    tip: 'Brazil requires dual approval: ANVISA (regulatory) + CEP/CONEP (ethics). Plan for longer timelines.',
  },
  CFDA: {
    fullName: 'China National Medical Products Administration (NMPA)',
    country: 'China',
    submissionType: 'IND (per 2020 Drug Registration Regulation)',
    keyRegulations: 'Drug Administration Law 2019; China GCP; ICH guidelines (since 2017 ICH member)',
    avgReviewTime: '60 working days (IND)',
    marketSize: '2nd largest pharma market (growing rapidly)',
    tip: 'China joined ICH in 2017 and now accepts multi-regional clinical trial data. Still requires Chinese patient enrollment for most registrations.',
  },
};

/* ── Score interpretation helper ── */
function getScoreInterpretation(score) {
  if (score >= 90) return { label: 'Submission Ready', desc: 'Protocol meets all major requirements for this jurisdiction. Minor administrative items may remain.', color: 'text-emerald-700' };
  if (score >= 75) return { label: 'Low Risk', desc: 'Protocol is largely compliant. A few non-critical adaptations needed before submission.', color: 'text-emerald-600' };
  if (score >= 60) return { label: 'Moderate Risk', desc: 'Several compliance gaps identified. Protocol amendments recommended before CTA/IND filing.', color: 'text-amber-600' };
  if (score >= 40) return { label: 'High Risk', desc: 'Significant compliance issues found. Major protocol revisions required to meet regulatory requirements.', color: 'text-orange-600' };
  return { label: 'Not Ready', desc: 'Critical gaps across multiple requirements. Protocol requires substantial rework before any submission.', color: 'text-red-600' };
}

function getGlobalReadinessInterpretation(score) {
  if (score >= 85) return 'Your protocol is well-positioned for simultaneous multi-country submissions with minimal country-specific adaptations.';
  if (score >= 70) return 'Your protocol is broadly compliant but needs targeted adaptations for some jurisdictions before parallel submission.';
  if (score >= 50) return 'Significant gaps exist across multiple jurisdictions. Consider a phased submission strategy, starting with highest-readiness regions.';
  return 'Protocol needs major revisions for global readiness. Recommend focusing on one or two lead jurisdictions first, then adapting for others.';
}

export default function JurisdictionCompass({ docId }) {
  const { jurisdictionScores, globalReadiness } = useRegulatory();
  const { lastAnalysis } = useAnalysis();
  const store = useAppStore();
  const [loading, setLoading] = useState(false);
  const [expandedJurisdiction, setExpandedJurisdiction] = useState(null);
  const [error, setError] = useState(null);

  // Load jurisdiction data from analysis or fetch separately
  useEffect(() => {
    if (lastAnalysis?.jurisdiction_scores?.length) {
      store.setJurisdictionScores(lastAnalysis.jurisdiction_scores);
      store.setGlobalReadiness(lastAnalysis.global_readiness_score || 0);
    } else if (docId) {
      loadJurisdictionData();
    }
  }, [docId, lastAnalysis]);

  const loadJurisdictionData = async () => {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getJurisdictionScores(docId);
      store.setJurisdictionScores(data.jurisdiction_scores || []);
      store.setGlobalReadiness(data.global_readiness_score || 0);
    } catch (err) {
      console.error('Failed to load jurisdiction data:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load jurisdiction data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-500 border-t-transparent" />
        <span className="ml-2 text-sm text-slate-500">Loading multi-jurisdiction compliance analysis...</span>
      </div>
    );
  }

  if (!jurisdictionScores.length) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 text-left">
            <div className="font-semibold mb-0.5">⚠️ Failed to load compliance data</div>
            <p>{error}</p>
            <button
              onClick={loadJurisdictionData}
              className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {!error && (
          <>
            <p>No jurisdiction compliance data available.</p>
            <p className="text-xs mt-1 text-slate-400">Run a regulatory analysis on your protocol to see compliance scores for FDA (US), EMA (EU), PMDA (Japan), TGA (Australia), and other regions.</p>
          </>
        )}
      </div>
    );
  }

  const highestReadiness = [...jurisdictionScores].sort((a, b) => (b.compliance_score || 0) - (a.compliance_score || 0))[0];
  const lowestReadiness = [...jurisdictionScores].sort((a, b) => (a.compliance_score || 0) - (b.compliance_score || 0))[0];

  return (
    <div className="space-y-4">
      {/* Score Legend — what the percentages mean */}
      <div className="p-3 rounded-xl bg-brand-50/60 border border-brand-100/60">
        <div className="text-[11px] font-semibold text-brand-700 mb-1.5">📊 Understanding Compliance Scores</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-slate-600"><strong>90–100%</strong> — Submission ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-slate-600"><strong>75–89%</strong> — Low risk, minor fixes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[11px] text-slate-600"><strong>60–74%</strong> — Amendments needed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[11px] text-slate-600"><strong>40–59%</strong> — Major revisions</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[11px] text-slate-600"><strong>0–39%</strong> — Not ready, critical gaps</span>
          </div>
        </div>
      </div>

      {/* Global Readiness Score */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Global Submission Readiness</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{Math.round(globalReadiness)}%</div>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
              {getGlobalReadinessInterpretation(globalReadiness)}
            </p>
          </div>
          <div className="w-16 h-16 rounded-full border-4 border-brand-200 flex items-center justify-center bg-white shrink-0 ml-3">
            <span className="text-lg font-bold text-brand-600">{Math.round(globalReadiness)}</span>
          </div>
        </div>

        {/* Quick insights */}
        {highestReadiness && lowestReadiness && (
          <div className="flex gap-2 mt-3 pt-2 border-t border-slate-200/60">
            <div className="flex-1 text-[11px]">
              <span className="text-slate-500">Highest readiness:</span>
              <span className="ml-1 font-semibold text-emerald-700">{highestReadiness.flag} {highestReadiness.label || highestReadiness.jurisdiction} ({highestReadiness.compliance_score}%)</span>
            </div>
            <div className="flex-1 text-[11px]">
              <span className="text-slate-500">Needs most work:</span>
              <span className="ml-1 font-semibold text-red-600">{lowestReadiness.flag} {lowestReadiness.label || lowestReadiness.jurisdiction} ({lowestReadiness.compliance_score}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Jurisdiction Grid */}
      <div className="grid grid-cols-2 gap-2">
        {jurisdictionScores.map((j) => {
          const interp = getScoreInterpretation(j.compliance_score || 0);
          return (
            <button
              key={j.jurisdiction}
              onClick={() => setExpandedJurisdiction(expandedJurisdiction === j.jurisdiction ? null : j.jurisdiction)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all cursor-pointer hover:shadow-md',
                RISK_BG[j.risk_level] || RISK_BG.medium,
                expandedJurisdiction === j.jurisdiction ? 'ring-2 ring-brand-300 shadow-md' : ''
              )}
              title={`${j.label || j.jurisdiction}: ${j.compliance_score}% compliance — ${interp.label}. Click for details.`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{j.flag || '🏳️'}</span>
                <span className={cn(
                  'text-[11px] px-1.5 py-0.5 rounded font-medium text-white',
                  RISK_COLORS[j.risk_level]
                )}>
                  {j.compliance_score}%
                </span>
              </div>
              <div className="mt-1">
                <div className="text-xs font-medium text-slate-700 truncate">{j.label || j.jurisdiction}</div>
                <div className={cn('text-[11px] font-medium', interp.color)}>{interp.label}</div>
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', RISK_COLORS[j.risk_level])}
                  style={{ width: `${j.compliance_score}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* AI provenance notice */}
      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-600">AI-Generated Scores:</span>{' '}
          Compliance scores are generated by AI agents analyzing your protocol against jurisdiction-specific regulatory requirements
          (ICH, FDA, EMA, PMDA, TGA, MHRA). Click any jurisdiction card for details and official guideline references.
          Scores are advisory — consult your regulatory affairs team for submission decisions.
        </p>
      </div>

      {/* Expanded Jurisdiction Detail — enhanced with regulatory body context */}
      {expandedJurisdiction && (() => {
        const j = jurisdictionScores.find(s => s.jurisdiction === expandedJurisdiction);
        if (!j) return null;
        const meta = JURISDICTION_META[j.jurisdiction] || {};
        const interp = getScoreInterpretation(j.compliance_score || 0);

        return (
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{j.flag}</span>
              <div>
                <div className="font-semibold text-slate-800">{j.label || j.jurisdiction}</div>
                {meta.fullName && (
                  <div className="text-[11px] text-slate-500">{meta.fullName}</div>
                )}
              </div>
            </div>

            {/* Score interpretation */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-xs font-semibold', interp.color)}>{j.compliance_score}% — {interp.label}</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{interp.desc}</p>
            </div>

            {/* Regulatory body details */}
            {(meta.submissionType || meta.avgReviewTime || meta.marketSize) && (
              <div className="grid grid-cols-1 gap-1.5">
                {meta.submissionType && (
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-slate-500 shrink-0 w-24">Submission Type:</span>
                    <span className="text-slate-700 font-medium">{meta.submissionType}</span>
                  </div>
                )}
                {meta.keyRegulations && (
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-slate-500 shrink-0 w-24">Key Regulations:</span>
                    <span className="text-slate-700">{meta.keyRegulations}</span>
                  </div>
                )}
                {meta.avgReviewTime && (
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-slate-500 shrink-0 w-24">Review Timeline:</span>
                    <span className="text-slate-700">{meta.avgReviewTime}</span>
                  </div>
                )}
                {meta.marketSize && (
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-slate-500 shrink-0 w-24">Market Context:</span>
                    <span className="text-slate-700">{meta.marketSize}</span>
                  </div>
                )}
              </div>
            )}

            {/* Regulatory tip */}
            {meta.tip && (
              <div className="p-2.5 rounded-lg bg-brand-50 border border-brand-100">
                <div className="text-[10px] text-brand-600 font-semibold uppercase tracking-wider mb-0.5">💡 Regulatory Tip</div>
                <p className="text-[11px] text-slate-700 leading-relaxed">{meta.tip}</p>
              </div>
            )}

            {j.blockers?.length > 0 && (
              <div>
                <div className="text-xs text-red-600 font-semibold mb-1.5">⛔ Submission Blockers ({j.blockers.length})</div>
                <p className="text-[11px] text-slate-500 mb-1">These issues must be resolved before you can file a CTA/IND in this jurisdiction:</p>
                {j.blockers.map((b, i) => (
                  <div key={i} className="text-xs text-slate-700 pl-3 py-1 border-l-2 border-red-300 bg-red-50/50 rounded-r mb-1">{b}</div>
                ))}
              </div>
            )}

            {j.adaptations?.length > 0 && (
              <div>
                <div className="text-xs text-amber-600 font-semibold mb-1.5">🔧 Required Protocol Adaptations ({j.adaptations.length})</div>
                <p className="text-[11px] text-slate-500 mb-1">Country-specific modifications needed for this jurisdiction:</p>
                {j.adaptations.map((a, i) => (
                  <div key={i} className="text-xs text-slate-700 pl-3 py-1 border-l-2 border-amber-300 bg-amber-50/50 rounded-r mb-1">{a}</div>
                ))}
              </div>
            )}

            {j.key_guidelines?.length > 0 && (
              <div>
                <div className="text-[11px] text-slate-500 font-medium mb-1">📋 Applicable Guidelines — Click to View Official Document</div>
                <GuidelineRefBadge refs={j.key_guidelines.map(g => {
                  // If backend already sent structured objects, use them; otherwise wrap the code string
                  if (typeof g === 'object' && g.code) return g;
                  return { code: g };
                })} />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
