import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, MessageSquare, Sparkles, Check, Loader2, CheckCircle, Database, Globe, Zap, DollarSign, BarChart3, Clock, FileSearch, HelpCircle, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../stores/useAppStore';
import ConflictHeatmap from './ConflictHeatmap';
import SmartPivotCard from './SmartPivotCard';
import ChatInterface from './ChatInterface';
import KnowledgeBasePanel from './SyntheticFactoryPanel';
import JurisdictionCompass from './JurisdictionCompass';
import AmendmentSimulator from './AmendmentSimulator';
import PayerGapPanel from './PayerGapPanel';
import BenchmarkPanel from './BenchmarkPanel';
import ProtocolTimeline from './ProtocolTimeline';
import ReportExport from './ReportExport';
import GuidelineRefBadge, { SmartClauseBadge } from './GuidelineRefBadge';
import { cn } from '../utils/cn';

const ANALYSIS_STEPS = [
  { label: 'Extracting protocol sections and endpoints...', duration: 650 },
  { label: 'Evaluating regulatory compliance (ICH E6/E8/E9, FDA 21 CFR, EMA guidelines)...', duration: 750 },
  { label: 'Assessing Health Technology Assessment (HTA) & payer readiness...', duration: 600 },
  { label: 'Generating findings, risk scores & recommendations...', duration: 700 },
];

/* ── Tab configuration with rich descriptions for clinical users ── */
const TAB_CONFIG = [
  {
    key: 'analysis',
    label: 'Findings',
    icon: FileSearch,
    shortDesc: 'Regulatory & Payer Findings',
    longDesc: 'View all AI-identified regulatory compliance issues, payer evidence gaps, and recommended corrective actions. Each finding includes severity, affected jurisdictions, guideline references, and suggested protocol language.',
    whyItMatters: 'Identifies submission-blocking issues early — before they delay your IND/CTA filing or compromise reimbursement negotiations.',
  },
  {
    key: 'jurisdiction',
    label: 'Jurisdictions',
    icon: Globe,
    shortDesc: 'Multi-Region Compliance Scores',
    longDesc: 'See compliance readiness scores for each target regulatory region (FDA, EMA, PMDA, TGA, Health Canada). Identify submission blockers and required protocol adaptations per country.',
    whyItMatters: 'Enables simultaneous multi-country submissions by surfacing region-specific gaps before you finalize your Clinical Trial Application.',
  },
  {
    key: 'payer',
    label: 'HTA & Payer',
    icon: DollarSign,
    shortDesc: 'Health Technology Assessment Readiness',
    longDesc: 'Evaluate your protocol against HTA body requirements from NICE (UK), IQWiG/AMNOG (Germany), CADTH (Canada), and PBAC (Australia). Identify evidence gaps that could affect market access and reimbursement.',
    whyItMatters: 'Protocols that embed payer-relevant endpoints from the start achieve 40% faster market access timelines and stronger reimbursement outcomes.',
  },
  {
    key: 'simulation',
    label: 'What-If',
    icon: Zap,
    shortDesc: 'Amendment Impact Simulator',
    longDesc: 'Describe a proposed protocol amendment and instantly see how it would affect your regulatory and payer compliance scores across all jurisdictions — before committing the change.',
    whyItMatters: 'Reduces costly protocol amendments by letting you model changes virtually. Each real amendment costs an average of $500K and delays timelines by 3+ months.',
  },
  {
    key: 'benchmark',
    label: 'Benchmark',
    icon: BarChart3,
    shortDesc: 'ClinicalTrials.gov Comparison',
    longDesc: 'Compare your protocol design metrics (sample size, study duration, number of endpoints, number of arms) against similar registered trials on ClinicalTrials.gov for your therapeutic area and phase.',
    whyItMatters: 'Benchmarking against industry standards helps justify your design choices to regulators, IRBs, and investors — and identifies potential operational risks.',
  },
  {
    key: 'timeline',
    label: 'Activity Log',
    icon: Clock,
    shortDesc: 'Regulatory Audit Trail',
    longDesc: 'Chronological record of every protocol event: document uploads, AI analyses, amendment simulations, protocol comparisons, and report generation. Full audit trail for regulatory inspections.',
    whyItMatters: 'GCP-compliant audit trails are mandatory for regulatory submissions. This log supports 21 CFR Part 11 and ICH E6(R2) traceability requirements.',
  },
  {
    key: 'chat',
    label: 'Ask AI',
    icon: MessageSquare,
    shortDesc: 'AI Regulatory Advisor',
    longDesc: 'Chat with the AI assistant about your protocol — ask about regulatory strategy, specific ICH guidelines, amendment impacts, comparator selection, endpoint justification, or get tailored recommendations.',
    whyItMatters: 'Get instant expert-level regulatory guidance without waiting for consultant availability. Backed by ICH, FDA, EMA, and HTA reference databases.',
  },
  {
    key: 'factory',
    label: 'References',
    icon: Database,
    shortDesc: 'Regulatory Reference Library',
    longDesc: 'Manage the regulatory reference documents (ICH guidelines, FDA guidance documents, EMA scientific advice, HTA frameworks) that power the AI analysis engine.',
    whyItMatters: 'Keeping reference documents up-to-date ensures your analyses reflect the latest regulatory expectations and guideline revisions.',
    adminOnly: true,
  },
];

export default function IntelligencePanel({ activeTab, setActiveTab, isAnalyzing, hasAnalyzed, currentDocument, lastAnalysis }) {
  const { isAdmin } = useAuth();
  const tabScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollState = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    checkScrollState();
    el.addEventListener('scroll', checkScrollState, { passive: true });
    const ro = new ResizeObserver(checkScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScrollState);
      ro.disconnect();
    };
  }, [checkScrollState]);

  const scrollTabs = (direction) => {
    const el = tabScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 160, behavior: 'smooth' });
  };

  if (isAnalyzing) {
    return <AnalysisLoadingState />;
  }

  if (!hasAnalyzed) {
    return <EmptyState />;
  }

  const visibleTabs = TAB_CONFIG.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab Bar — horizontally scrollable with arrow buttons ── */}
      <div className="relative flex items-stretch border-b border-slate-200 bg-white shrink-0 shadow-sm">
        {/* Left scroll arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTabs(-1)}
            className="absolute left-0 top-0 bottom-0 z-20 w-7 flex items-center justify-center bg-gradient-to-r from-white via-white/95 to-transparent hover:from-slate-50"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft size={14} className="text-slate-500" />
          </button>
        )}

        <div
          ref={tabScrollRef}
          className="flex w-full overflow-x-auto scrollbar-hide px-1"
          style={{ scrollBehavior: 'smooth' }}
        >
          {visibleTabs.map((tab) => (
            <TabButton
              key={tab.key}
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              label={tab.label}
              icon={<tab.icon size={14} />}
              badge={tab.key === 'analysis' ? (lastAnalysis?.findings?.length || null) : null}
              shortDesc={tab.shortDesc}
              longDesc={tab.longDesc}
              whyItMatters={tab.whyItMatters}
            />
          ))}
        </div>

        {/* Right scroll arrow */}
        {canScrollRight && (
          <button
            onClick={() => scrollTabs(1)}
            className="absolute right-0 top-0 bottom-0 z-20 w-7 flex items-center justify-center bg-gradient-to-l from-white via-white/95 to-transparent hover:from-slate-50"
            aria-label="Scroll tabs right"
          >
            <ChevronRight size={14} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* ── Tab Context Banner — shows what the active tab does ── */}
      <TabContextBanner activeTab={activeTab} tabs={visibleTabs} />

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        {activeTab === 'analysis' ? (
          <div className="pb-10 stagger-children">
            <ConflictHeatmap
              regulatorScore={lastAnalysis?.regulatorScore ?? 0}
              payerScore={lastAnalysis?.payerScore ?? 0}
              globalReadiness={lastAnalysis?.global_readiness_score ?? 0}
              findings={lastAnalysis?.findings ?? []}
              summary={lastAnalysis?.summary ?? ''}
            />
            <SmartPivotCard findings={lastAnalysis?.findings ?? []} />

            {/* Report Export Button */}
            <div className="px-6 mt-5">
              <ReportExport docId={currentDocument?.id} docName={currentDocument?.name} />
            </div>

            {/* Detailed Findings — enhanced with ICH refs and smart clauses */}
            <div className="px-6 mt-6 space-y-3">
              <div className="flex items-center justify-between py-2 px-3 bg-slate-100/80 rounded-lg border border-slate-200/60">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Regulatory & Payer Findings</h3>
                <span className="text-xs font-semibold text-slate-500">Total: {lastAnalysis?.findings?.length || 0} issues identified</span>
              </div>

              {/* Findings Legend */}
              <div className="px-3 py-2 rounded-lg bg-brand-50/50 border border-brand-100/60">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-semibold text-brand-700">How to read findings:</span> Each finding shows a <span className="font-semibold text-red-600">severity level</span> (Critical → Low), 
                  the <span className="font-semibold">affected protocol section</span>, <span className="font-semibold">jurisdictions impacted</span>, and the 
                  specific <span className="font-semibold">ICH/FDA/EMA guideline</span> reference. Click any finding to see the recommended corrective action and suggested protocol language.
                </p>
              </div>

              {lastAnalysis?.findings?.length > 0 ? (
                lastAnalysis.findings.map((finding, idx) => (
                  <FindingCard
                    key={idx}
                    type={finding.severity === 'high' || finding.severity === 'critical' || finding.type === 'regulatory' ? 'risk' : 'money'}
                    title={finding.title || finding.category || 'Finding'}
                    text={finding.description || finding.text || finding.summary || ''}
                    section={finding.section || ''}
                    severity={finding.severity}
                    suggestion={finding.suggestion}
                    guidelineRefs={finding.guideline_refs}
                    jurisdictions={finding.jurisdictions_affected}
                    suggestedClause={finding.suggested_clause}
                    confidence={finding.confidence}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <CheckCircle size={24} className="mx-auto text-green-400 mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No compliance issues detected</p>
                  <p className="text-xs text-slate-400 mt-1">Your protocol meets the regulatory and payer requirements reviewed in this analysis.</p>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'jurisdiction' ? (
          <div className="p-4">
            <JurisdictionCompass docId={currentDocument?.id} />
          </div>
        ) : activeTab === 'payer' ? (
          <div className="p-4">
            <PayerGapPanel docId={currentDocument?.id} />
          </div>
        ) : activeTab === 'simulation' ? (
          <div className="p-4">
            <AmendmentSimulator docId={currentDocument?.id} />
          </div>
        ) : activeTab === 'benchmark' ? (
          <div className="p-4">
            <BenchmarkPanel docId={currentDocument?.id} />
          </div>
        ) : activeTab === 'timeline' ? (
          <div className="p-4">
            <ProtocolTimeline docId={currentDocument?.id} />
          </div>
        ) : activeTab === 'chat' ? (
          <ChatInterface currentDocument={currentDocument} />
        ) : (
          <KnowledgeBasePanel />
        )}
      </div>
    </div>
  );
}

/* ── Multi-step Analysis Loader ── */
function AnalysisLoadingState() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let timeout;
    const advanceStep = (step) => {
      if (step < ANALYSIS_STEPS.length) {
        timeout = setTimeout(() => {
          setCurrentStep(step + 1);
          advanceStep(step + 1);
        }, ANALYSIS_STEPS[step].duration);
      }
    };
    advanceStep(0);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
      {/* Spinner */}
      <div className="relative mb-8">
        <div className="h-20 w-20 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles size={24} className="text-brand-600" />
        </div>
      </div>

      <h3 className="text-slate-900 font-bold text-lg mb-1">Analyzing Your Protocol</h3>
      <p className="text-slate-400 text-sm mb-8">Our AI regulatory agents are reviewing your clinical trial protocol...</p>

      {/* Progress Steps */}
      <div className="w-full max-w-[260px] space-y-3 text-left">
        {ANALYSIS_STEPS.map((step, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-3 transition-all duration-300',
              idx <= currentStep ? 'opacity-100' : 'opacity-20'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                idx < currentStep
                  ? 'bg-green-500 text-white'
                  : idx === currentStep
                    ? 'bg-brand-100 text-brand-600'
                    : 'bg-slate-100'
              )}
            >
              {idx < currentStep ? (
                <Check size={11} strokeWidth={3} />
              ) : idx === currentStep ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              )}
            </div>
            <span
              className={cn(
                'text-xs font-medium transition-colors',
                idx < currentStep
                  ? 'text-green-600'
                  : idx === currentStep
                    ? 'text-slate-700'
                    : 'text-slate-400'
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[260px] mt-6">
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / ANALYSIS_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
      <div className="h-24 w-24 bg-slate-50 rounded-2xl flex items-center justify-center mb-5 border border-slate-100 shadow-sm">
        <Sparkles size={32} className="text-slate-300" />
      </div>
      <h3 className="text-slate-700 font-semibold mb-1">Ready for Regulatory Review</h3>
      <p className="text-slate-400 text-sm max-w-[260px] leading-relaxed">
        Click <span className="font-semibold text-brand-600">"Run Analysis"</span> in the top bar to scan your clinical trial protocol for regulatory compliance and payer readiness.
      </p>
      <div className="mt-5 text-[11px] text-slate-300 max-w-[240px] leading-relaxed">
        The analysis checks your protocol against ICH E6(R2)/E8/E9 guidelines, FDA 21 CFR requirements, EMA scientific guidance, and HTA body criteria from NICE, IQWiG, CADTH, and PBAC.
      </div>
    </div>
  );
}

/* ── Tab Context Banner — shows what the active tab does ── */
function TabContextBanner({ activeTab, tabs }) {
  const tab = tabs.find(t => t.key === activeTab);
  if (!tab) return null;

  return (
    <div className="px-4 py-2.5 bg-gradient-to-r from-brand-50/80 to-slate-50/50 border-b border-slate-200/60 shrink-0">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 w-5 h-5 rounded bg-brand-100 flex items-center justify-center">
          <tab.icon size={11} className="text-brand-600" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-800">{tab.shortDesc}</div>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{tab.longDesc}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Rich Tooltip Component ── */
function TabTooltip({ shortDesc, longDesc, whyItMatters, visible }) {
  if (!visible) return null;

  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-72 pointer-events-none animate-fade-in">
      <div className="bg-slate-900 text-white rounded-xl shadow-xl p-3.5 text-left border border-slate-700/50">
        {/* Arrow */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 border-l border-t border-slate-700/50" />
        
        <div className="text-[12px] font-semibold text-white mb-1">{shortDesc}</div>
        <p className="text-[11px] text-slate-300 leading-relaxed">{longDesc}</p>
        
        {whyItMatters && (
          <div className="mt-2.5 pt-2 border-t border-slate-700/50">
            <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wider mb-0.5">💡 Why it matters</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{whyItMatters}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tab Button — with rich hover tooltip ── */
function TabButton({ active, onClick, label, icon, badge, shortDesc, longDesc, whyItMatters }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 400);
  };
  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-all relative whitespace-nowrap shrink-0',
        active
          ? 'text-brand-700 font-semibold'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50/80'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge && (
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
            active ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
          )}
        >
          {badge}
        </span>
      )}
      {active && <div className="absolute bottom-0 left-1 right-1 h-[2.5px] bg-brand-600 rounded-full" />}
      <TabTooltip
        shortDesc={shortDesc}
        longDesc={longDesc}
        whyItMatters={whyItMatters}
        visible={showTooltip && !active}
      />
    </button>
  );
}

/* ── Finding Card (Enhanced with ICH refs, jurisdictions, smart clauses) ── */
function FindingCard({ type, title, text, section, severity, suggestion, guidelineRefs, jurisdictions, suggestedClause, confidence }) {
  const [expanded, setExpanded] = useState(false);
  const isRisk = type === 'risk';
  const hasExpandedContent = suggestion || suggestedClause;

  const severityConfig = {
    critical: { color: 'border-l-red-500 bg-red-50/30', badge: 'bg-red-100 text-red-700', icon: 'text-red-500' },
    high: { color: 'border-l-orange-500 bg-orange-50/30', badge: 'bg-orange-100 text-orange-700', icon: 'text-orange-500' },
    medium: { color: 'border-l-amber-400 bg-amber-50/20', badge: 'bg-amber-100 text-amber-700', icon: 'text-amber-500' },
    low: { color: 'border-l-emerald-400 bg-emerald-50/20', badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-500' },
  };
  const sevConf = severityConfig[(severity || 'medium').toLowerCase()] || severityConfig.medium;

  return (
    <div
      className={cn(
        'p-4 rounded-xl border border-l-4 bg-white transition-all duration-200 hover:shadow-md cursor-pointer group animate-fade-in',
        sevConf.color
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 shrink-0', sevConf.icon)}>
          {isRisk ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h4 className="text-sm font-bold text-slate-900 leading-tight">
              {title}
            </h4>
            {severity && (
              <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full', sevConf.badge)}>
                {severity}
              </span>
            )}
            {section && (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {section}
              </span>
            )}
            {confidence != null && (
              <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                {confidence}% confidence
              </span>
            )}
          </div>
          <p className="text-[13px] text-slate-700 leading-relaxed">{text}</p>

          {/* Jurisdiction badges */}
          {jurisdictions?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {jurisdictions.map((j, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium border border-slate-200/60">{j}</span>
              ))}
            </div>
          )}

          {/* ICH Guideline references (REQ-1) */}
          <GuidelineRefBadge refs={guidelineRefs} />

          {/* Expand indicator */}
          {hasExpandedContent && !expanded && (
            <div className="text-[11px] text-brand-600 mt-2 font-semibold flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              Click to see recommended action
            </div>
          )}

          {/* Expanded: suggestion + smart clause */}
          {expanded && suggestion && (
            <div className="mt-2 p-2.5 rounded-lg bg-brand-50 border border-brand-100">
              <div className="text-[10px] text-brand-600 font-semibold uppercase tracking-wider mb-1">💡 Recommended Action</div>
              <p className="text-xs text-slate-700 leading-relaxed">{suggestion}</p>
            </div>
          )}

          {/* Smart clause (REQ-7) — show on expand */}
          {expanded && suggestedClause && (
            <SmartClauseBadge clause={suggestedClause} />
          )}
        </div>
      </div>
    </div>
  );
}
