import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle, MessageSquare, Sparkles, Check, Loader2, CheckCircle,
  Database, Globe, Zap, DollarSign, BarChart3, Clock, FileSearch,
  Users, Flame, Calculator, CreditCard, Route, Wand2, Eye, BookOpen,
  Brain, Shield, Wrench,
} from 'lucide-react';
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
import AdversarialCouncil from './AdversarialCouncil';
import FrictionHeatmap from './FrictionHeatmap';
import CostArchitect from './CostArchitect';
import PayerSimulator from './PayerSimulator';
import SubmissionStrategy from './SubmissionStrategy';
import ProtocolOptimizer from './ProtocolOptimizer';
import ComplianceWatchdog from './ComplianceWatchdog';
import SmartClauseLibrary from './SmartClauseLibrary';
import { cn } from '../utils/cn';

/* ── Error Boundary: prevents child component crashes from white-screening the entire panel ── */
class IntelligencePanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('IntelligencePanel child crashed:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <AlertCircle size={24} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm font-medium text-slate-700 mb-1">This section encountered an error</p>
          <p className="text-xs text-slate-400 mb-3">{this.state.error?.message || 'Unexpected error'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs text-brand-600 hover:text-brand-800 font-semibold"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Analysis progress steps ── */
const ANALYSIS_STEPS = [
  { label: 'Extracting protocol sections and endpoints...', duration: 650 },
  { label: 'Evaluating regulatory compliance (ICH E6/E8/E9, FDA 21 CFR, EMA)...', duration: 750 },
  { label: 'Assessing Health Technology Assessment (HTA) & payer readiness...', duration: 600 },
  { label: 'Generating findings, risk scores & recommendations...', duration: 700 },
];

/* ══════════════════════════════════════════════════════════════════
   TWO-TIER GROUPED NAVIGATION
   
   Clinical users see 4 logical categories that match their workflow,
   instead of 16 overwhelming flat tabs:
   
   1. REVIEW        — Core analysis outputs (what the AI found)
   2. INTELLIGENCE   — Deep strategic AI insights
   3. COMPLIANCE     — Monitoring & regulatory tracking
   4. TOOLS          — Interactive utilities & AI chat
   ══════════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  {
    id: 'review',
    label: 'Review',
    icon: FileSearch,
    color: 'brand',
    description: 'Core analysis — findings, compliance scores, market access',
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    icon: Brain,
    color: 'violet',
    description: 'AI-powered strategy — costs, payer predictions, optimization',
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    color: 'emerald',
    description: 'Monitoring — change scanning, clauses, audit trail',
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: Wrench,
    color: 'amber',
    description: 'Simulate, benchmark, and ask the AI advisor',
  },
];

const TABS = [
  // ── REVIEW ──
  {
    key: 'analysis', category: 'review', label: 'Findings', icon: FileSearch,
    shortDesc: 'Regulatory & Payer Findings',
    longDesc: 'All AI-identified compliance issues, evidence gaps, and corrective actions with severity, jurisdictions, and guideline references.',
  },
  {
    key: 'jurisdiction', category: 'review', label: 'Jurisdictions', icon: Globe,
    shortDesc: 'Multi-Region Compliance Scores',
    longDesc: 'Compliance readiness for FDA, EMA, PMDA, TGA, and Health Canada with submission blockers per country.',
  },
  {
    key: 'payer', category: 'review', label: 'HTA & Payer', icon: DollarSign,
    shortDesc: 'Market Access Readiness',
    longDesc: 'Evaluation against HTA requirements from NICE, IQWiG/AMNOG, CADTH, and PBAC.',
  },

  // ── INTELLIGENCE ──
  {
    key: 'council', category: 'intelligence', label: 'Expert Panel', icon: Users,
    shortDesc: 'AI Expert Panel — Multi-Perspective Debate',
    longDesc: 'Three specialized AI experts debate your protocol: a Regulatory Expert, a Commercial Director, and a Patient Advocate — with real-time transcript and consensus verdict.',
  },
  {
    key: 'friction', category: 'intelligence', label: 'Risk Conflicts', icon: Flame,
    shortDesc: 'Regulatory vs. Commercial Conflict Map',
    longDesc: 'Identifies where regulatory and commercial requirements conflict — high-conflict areas mean resolving one issue may worsen the other.',
  },
  {
    key: 'cost', category: 'intelligence', label: 'Cost Forecast', icon: Calculator,
    shortDesc: 'Trial Cost Forecast & Optimization',
    longDesc: 'Full cost estimate with per-finding financial impact, amendment risk quantification, and cost-reduction scenarios using real industry benchmarks.',
  },
  {
    key: 'payer-sim', category: 'intelligence', label: 'Coverage Forecast', icon: CreditCard,
    shortDesc: 'Payer Coverage Forecast',
    longDesc: 'Predict coverage decisions from UnitedHealthcare, Anthem, NICE, IQWiG and other major payers — with denial probabilities and revenue-at-risk estimates.',
  },
  {
    key: 'strategy', category: 'intelligence', label: 'Filing Strategy', icon: Route,
    shortDesc: 'Global Submission Strategy',
    longDesc: 'Optimized global filing order across FDA, EMA, PMDA, and other agencies with a unified protocol that satisfies all jurisdictions simultaneously.',
  },
  {
    key: 'optimizer', category: 'intelligence', label: 'Protocol Rewrites', icon: Wand2,
    shortDesc: 'AI Protocol Rewrite Suggestions',
    longDesc: 'Ready-to-use protocol text rewrites for each finding — showing original text, improved text, and the specific guideline citation that justifies each change.',
  },

  // ── COMPLIANCE ──
  {
    key: 'watchdog', category: 'compliance', label: 'Regulatory Updates', icon: Eye,
    shortDesc: 'Regulatory Change Scanner',
    longDesc: 'Scans your protocol against recent regulatory updates — ICH E6(R3), FDA Diversity Plans, EU HTA Regulation — and flags compliance drift with required actions.',
  },
  {
    key: 'clauses', category: 'compliance', label: 'Clause Library', icon: BookOpen,
    shortDesc: 'Regulatory Clause Library',
    longDesc: 'Browse AI-suggested regulatory clauses for your protocol — filtered by severity, with full guideline citations and copy-to-clipboard support.',
  },
  {
    key: 'timeline', category: 'compliance', label: 'Audit Trail', icon: Clock,
    shortDesc: 'GCP-Compliant Audit Trail',
    longDesc: 'Full chronological record of all protocol events, analysis runs, and changes — supports 21 CFR Part 11 electronic record requirements.',
  },

  // ── TOOLS ──
  {
    key: 'simulation', category: 'tools', label: 'Amendment Simulator', icon: Zap,
    shortDesc: 'Protocol Amendment Impact Simulator',
    longDesc: 'Model a proposed protocol amendment and instantly see its impact on compliance scores across all jurisdictions before committing to the change.',
  },
  {
    key: 'benchmark', category: 'tools', label: 'Trial Benchmarks', icon: BarChart3,
    shortDesc: 'ClinicalTrials.gov Benchmark Comparison',
    longDesc: 'Compare your protocol design metrics against similar registered trials — by therapeutic area, phase, and population size.',
  },
  {
    key: 'chat', category: 'tools', label: 'AI Advisor', icon: MessageSquare,
    shortDesc: 'AI Regulatory Advisor Chat',
    longDesc: 'Ask questions about strategy, guidelines, endpoints, comparators, or any protocol detail — backed by your Knowledge Base for grounded, cited answers.',
  },
  {
    key: 'factory', category: 'tools', label: 'References', icon: Database,
    shortDesc: 'Regulatory Reference Library',
    longDesc: 'Manage ICH, FDA, EMA, and HTA reference documents powering all AI analysis.',
    adminOnly: true,
  },
];

/* ── Category color palette ── */
const COLORS = {
  brand: {
    bg: 'bg-brand-50', bgActive: 'bg-brand-100', text: 'text-brand-700',
    textMuted: 'text-brand-500', ring: 'ring-brand-500/20',
    gradient: 'from-brand-500 to-brand-600', pillBg: 'bg-brand-100',
  },
  violet: {
    bg: 'bg-violet-50', bgActive: 'bg-violet-100', text: 'text-violet-700',
    textMuted: 'text-violet-500', ring: 'ring-violet-500/20',
    gradient: 'from-violet-500 to-violet-600', pillBg: 'bg-violet-100',
  },
  emerald: {
    bg: 'bg-emerald-50', bgActive: 'bg-emerald-100', text: 'text-emerald-700',
    textMuted: 'text-emerald-500', ring: 'ring-emerald-500/20',
    gradient: 'from-emerald-500 to-emerald-600', pillBg: 'bg-emerald-100',
  },
  amber: {
    bg: 'bg-amber-50', bgActive: 'bg-amber-100', text: 'text-amber-700',
    textMuted: 'text-amber-500', ring: 'ring-amber-500/20',
    gradient: 'from-amber-500 to-amber-600', pillBg: 'bg-amber-100',
  },
};

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */
export default function IntelligencePanel({ activeTab, setActiveTab, isAnalyzing, hasAnalyzed, currentDocument, lastAnalysis, cacheTimestamps }) {
  const { isAdmin } = useAuth();
  const [activeCategory, setActiveCategory] = useState('review');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const tabsContainerRef = React.useRef(null);

  // Sync category when tab changes externally
  useEffect(() => {
    const tab = TABS.find(t => t.key === activeTab);
    if (tab) setActiveCategory(tab.category);
  }, [activeTab]);

  // Switch category → auto-select first tab in it
  const handleCategoryChange = useCallback((catId) => {
    if (catId === activeCategory) return;
    setIsTransitioning(true);
    setActiveCategory(catId);
    const first = TABS.find(t => t.category === catId && (!t.adminOnly || isAdmin));
    if (first) setActiveTab(first.key);
    setTimeout(() => setIsTransitioning(false), 250);
  }, [isAdmin, setActiveTab, activeCategory]);

  // Scroll active tab into view on mobile
  useEffect(() => {
    if (tabsContainerRef.current) {
      const activeButton = tabsContainerRef.current.querySelector('[data-active="true"]');
      if (activeButton) {
        activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  if (isAnalyzing) return <AnalysisLoadingState />;
  if (!hasAnalyzed) return <EmptyState />;

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);
  const categoryTabs = visibleTabs.filter(t => t.category === activeCategory);
  const catConfig = CATEGORIES.find(c => c.id === activeCategory);
  const tabConfig = TABS.find(t => t.key === activeTab);
  const colors = COLORS[catConfig?.color || 'brand'];

  return (
    <div className="flex flex-col h-full">
      {/* ═══════════ TIER 1: Category Bar ═══════════ */}
      <div className="flex items-stretch border-b border-slate-200 bg-white shrink-0">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          const c = COLORS[cat.color];
          const count = visibleTabs.filter(t => t.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-3 transition-all duration-200 relative group',
                isActive
                  ? cn(c.text, c.bg)
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/80'
              )}
              title={cat.description}
            >
              <cat.icon 
                size={16} 
                className={cn(
                  'transition-all duration-200 shrink-0',
                  isActive ? cn(c.textMuted, 'scale-105') : 'text-slate-400 group-hover:text-slate-500'
                )} 
              />
              <span className={cn(
                'text-xs font-semibold hidden sm:inline transition-all duration-200',
                isActive && 'tracking-wide'
              )}>
                {cat.label}
              </span>
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none transition-all duration-200 shrink-0',
                isActive ? cn(c.pillBg, c.text, 'scale-105 shadow-sm') : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
              )}>
                {count}
              </span>
              {isActive && (
                <div className={cn(
                  'absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r transition-all duration-200',
                  c.gradient
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════ TIER 2: Sub-tabs for active category ═══════════ */}
      <div 
        ref={tabsContainerRef}
        className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 shrink-0 px-3 py-2 overflow-x-auto scrollbar-hide"
      >
        {categoryTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              title={tab.shortDesc}
              data-active={isActive}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0 rounded-lg',
                isActive
                  ? cn('bg-white shadow-sm ring-1 scale-105', colors.text, colors.ring)
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/60 hover:shadow-sm'
              )}
            >
              <tab.icon size={13} className="shrink-0" />
              <span className="transition-all duration-200">{tab.label}</span>
              {tab.key === 'analysis' && (lastAnalysis?.findings?.length > 0) && (
                <span className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center transition-all duration-200',
                  isActive ? 'bg-red-100 text-red-700 scale-110 shadow-sm animate-badge-pulse' : 'bg-slate-200 text-slate-500'
                )}>
                  {lastAnalysis.findings.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════ Context Banner ═══════════ */}
      {tabConfig && (
        <div className={cn(
          'px-4 py-2.5 border-b border-slate-200/60 shrink-0 transition-all duration-300',
          colors.bg
        )}>
          <div className="flex items-start gap-2.5">
            <div className={cn(
              'mt-0.5 shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200',
              colors.bgActive
            )}>
              <tabConfig.icon size={13} className={cn(colors.textMuted, 'transition-transform duration-200')} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn(
                'text-[12.5px] font-semibold transition-all duration-200',
                colors.text
              )}>
                {tabConfig.shortDesc}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-1 transition-all duration-200">
                {tabConfig.longDesc}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Content Area ═══════════ */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 transition-all duration-200">
        <IntelligencePanelErrorBoundary key={activeTab}>
        <div className={cn(
          'transition-all duration-250',
          isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        )}>
          {activeTab === 'analysis' ? (
            <AnalysisContent lastAnalysis={lastAnalysis} currentDocument={currentDocument} />
          ) : activeTab === 'jurisdiction' ? (
            <div className="p-4"><JurisdictionCompass docId={currentDocument?.id} /></div>
          ) : activeTab === 'payer' ? (
            <div className="p-4"><PayerGapPanel docId={currentDocument?.id} /></div>
          ) : activeTab === 'council' ? (
            <div className="p-4"><AdversarialCouncil docId={currentDocument?.id} generatedAt={cacheTimestamps?.council} /></div>
          ) : activeTab === 'friction' ? (
            <div className="p-4"><FrictionHeatmap docId={currentDocument?.id} generatedAt={cacheTimestamps?.friction_map} /></div>
          ) : activeTab === 'cost' ? (
            <div className="p-4"><CostArchitect docId={currentDocument?.id} generatedAt={cacheTimestamps?.cost_analysis} /></div>
          ) : activeTab === 'payer-sim' ? (
            <div className="p-4"><PayerSimulator docId={currentDocument?.id} generatedAt={cacheTimestamps?.payer_simulation} /></div>
          ) : activeTab === 'strategy' ? (
            <div className="p-4"><SubmissionStrategy docId={currentDocument?.id} generatedAt={cacheTimestamps?.submission_strategy} /></div>
          ) : activeTab === 'optimizer' ? (
            <div className="p-4"><ProtocolOptimizer docId={currentDocument?.id} generatedAt={cacheTimestamps?.optimization} /></div>
          ) : activeTab === 'watchdog' ? (
            <div className="p-4"><ComplianceWatchdog docId={currentDocument?.id} generatedAt={cacheTimestamps?.watchdog} /></div>
          ) : activeTab === 'clauses' ? (
            <div className="p-4"><SmartClauseLibrary docId={currentDocument?.id} /></div>
          ) : activeTab === 'timeline' ? (
            <div className="p-4"><ProtocolTimeline docId={currentDocument?.id} /></div>
          ) : activeTab === 'simulation' ? (
            <div className="p-4"><AmendmentSimulator docId={currentDocument?.id} /></div>
          ) : activeTab === 'benchmark' ? (
            <div className="p-4"><BenchmarkPanel docId={currentDocument?.id} /></div>
          ) : activeTab === 'chat' ? (
            <ChatInterface currentDocument={currentDocument} />
          ) : (
            <KnowledgeBasePanel />
          )}
        </div>
        </IntelligencePanelErrorBoundary>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ANALYSIS TAB CONTENT
   ════════════════════════════════════════════════════════════════ */
function AnalysisContent({ lastAnalysis, currentDocument }) {
  return (
    <div className="pb-10 stagger-children">
      <ConflictHeatmap
        regulatorScore={lastAnalysis?.regulatorScore ?? 0}
        payerScore={lastAnalysis?.payerScore ?? 0}
        globalReadiness={lastAnalysis?.global_readiness_score ?? 0}
        findings={lastAnalysis?.findings ?? []}
        summary={lastAnalysis?.summary ?? ''}
      />
      <SmartPivotCard findings={lastAnalysis?.findings ?? []} />

      {/* Report Export */}
      <div className="px-6 mt-5">
        <ReportExport docId={currentDocument?.id} docName={currentDocument?.name} />
      </div>

      {/* Findings List */}
      <div className="px-6 mt-6 space-y-3">
        <div className="flex items-center justify-between py-2 px-3 bg-slate-100/80 rounded-lg border border-slate-200/60">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Regulatory & Payer Findings</h3>
          <span className="text-xs font-semibold text-slate-500">
            {lastAnalysis?.findings?.length || 0} issues identified
          </span>
        </div>

        {/* How to read findings */}
        <div className="px-3 py-2 rounded-lg bg-brand-50/50 border border-brand-100/60">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            <span className="font-semibold text-brand-700">✓ KB-Grounded Analysis:</span> All findings are cross-referenced against 
            <span className="font-semibold"> ICH/FDA/EMA/HTA guidelines</span> in your Knowledge Base. Each finding shows
            a <span className="font-semibold text-red-600">severity</span> (Critical → Low), the
            <span className="font-semibold"> protocol section</span>,
            <span className="font-semibold"> affected jurisdictions</span>, and
            <span className="font-semibold"> clickable guideline citations</span> with section numbers.
            Click any finding to see the recommended action and suggested protocol language.
          </p>
        </div>

        {lastAnalysis?.findings?.length > 0 ? (
          lastAnalysis.findings.map((finding, idx) => (
            <FindingCard
              key={finding.id || `${finding.title || finding.category || ''}-${idx}`}
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
            <p className="text-xs text-slate-400 mt-1">Your protocol meets all reviewed regulatory and payer requirements.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MULTI-STEP ANALYSIS LOADER
   ════════════════════════════════════════════════════════════════ */
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
      <div className="relative mb-8">
        <div className="h-20 w-20 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles size={24} className="text-brand-600" />
        </div>
      </div>

      <h3 className="text-slate-900 font-bold text-lg mb-1">Analyzing Your Protocol</h3>
      <p className="text-slate-400 text-sm mb-8">
        Our AI regulatory agents are reviewing your clinical trial protocol...
      </p>

      <div className="w-full max-w-[280px] space-y-3 text-left">
        {ANALYSIS_STEPS.map((step, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-3 transition-all duration-300',
              idx <= currentStep ? 'opacity-100' : 'opacity-20'
            )}
          >
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
              idx < currentStep ? 'bg-green-500 text-white'
                : idx === currentStep ? 'bg-brand-100 text-brand-600'
                : 'bg-slate-100'
            )}>
              {idx < currentStep ? (
                <Check size={11} strokeWidth={3} />
              ) : idx === currentStep ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              )}
            </div>
            <span className={cn(
              'text-xs font-medium transition-colors',
              idx < currentStep ? 'text-green-600'
                : idx === currentStep ? 'text-slate-700'
                : 'text-slate-400'
            )}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-[280px] mt-6">
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

/* ════════════════════════════════════════════════════════════════
   EMPTY STATE — Guided onboarding showing what analysis provides
   ════════════════════════════════════════════════════════════════ */
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
      <div className="h-24 w-24 bg-gradient-to-br from-brand-50 to-slate-50 rounded-2xl flex items-center justify-center mb-6 border border-brand-100/60 shadow-sm">
        <Sparkles size={32} className="text-brand-400" />
      </div>
      <h3 className="text-slate-800 font-bold text-lg mb-2">Ready for Regulatory Review</h3>
      <p className="text-slate-400 text-sm max-w-[300px] leading-relaxed mb-6">
        Click <span className="font-semibold text-brand-600">"Run Regulatory Analysis"</span> in the top bar to scan your protocol for compliance issues and market access readiness.
      </p>

      <div className="w-full max-w-[320px] space-y-2 text-left">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">What you'll unlock:</p>
        {[
          { icon: FileSearch, color: 'text-brand-500 bg-brand-50', label: 'Regulatory & payer findings with severity ratings' },
          { icon: Globe, color: 'text-brand-500 bg-brand-50', label: 'Multi-jurisdiction compliance scores (FDA, EMA, PMDA…)' },
          { icon: Brain, color: 'text-violet-500 bg-violet-50', label: 'AI debate engine, cost analysis, and payer predictions' },
          { icon: Shield, color: 'text-emerald-500 bg-emerald-50', label: 'Compliance monitoring against latest regulations' },
          { icon: Wand2, color: 'text-amber-500 bg-amber-50', label: 'Copy-paste protocol text rewrites for each finding' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5">
            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', item.color.split(' ')[1])}>
              <item.icon size={12} className={item.color.split(' ')[0]} />
            </div>
            <span className="text-[12px] text-slate-500 leading-snug">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 text-[10px] text-slate-300 max-w-[280px] leading-relaxed">
        Analysis checks against ICH E6(R2)/E8/E9, FDA 21 CFR, EMA guidance, and HTA criteria from NICE, IQWiG, CADTH, and PBAC.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   FINDING CARD (with ICH refs, jurisdictions, smart clauses)
   ════════════════════════════════════════════════════════════════ */
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
            <h4 className="text-sm font-bold text-slate-900 leading-tight">{title}</h4>
            {severity && (
              <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full', sevConf.badge)}>
                {severity}
              </span>
            )}
            {section && (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{section}</span>
            )}
            {confidence != null && (
              <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{confidence}% confidence</span>
            )}
          </div>
          <p className="text-[13px] text-slate-700 leading-relaxed">{text}</p>

          {jurisdictions?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {jurisdictions.map((j, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium border border-slate-200/60">{j}</span>
              ))}
            </div>
          )}

          <GuidelineRefBadge refs={guidelineRefs} />

          {hasExpandedContent && !expanded && (
            <div className="text-[11px] text-brand-600 mt-2 font-semibold flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              Click to see recommended action
            </div>
          )}

          {expanded && suggestion && (
            <div className="mt-2 p-2.5 rounded-lg bg-brand-50 border border-brand-100">
              <div className="text-[10px] text-brand-600 font-semibold uppercase tracking-wider mb-1">💡 Recommended Action</div>
              <p className="text-xs text-slate-700 leading-relaxed">{suggestion}</p>
            </div>
          )}

          {expanded && suggestedClause && (
            <SmartClauseBadge clause={suggestedClause} />
          )}
        </div>
      </div>
    </div>
  );
}
