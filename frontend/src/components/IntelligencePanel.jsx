import React, { useState, useEffect } from 'react';
import { AlertCircle, MessageSquare, Sparkles, Check, Loader2, CheckCircle, Database } from 'lucide-react';
import { useAuth } from '../stores/useAppStore';
import ConflictHeatmap from './ConflictHeatmap';
import SmartPivotCard from './SmartPivotCard';
import ChatInterface from './ChatInterface';
import KnowledgeBasePanel from './SyntheticFactoryPanel';
import { cn } from '../utils/cn';

const ANALYSIS_STEPS = [
  { label: 'Scanning regulatory requirements...', duration: 650 },
  { label: 'Simulating payer cost objections...', duration: 750 },
  { label: 'Cross-referencing rejection database...', duration: 600 },
  { label: 'Generating strategic pivots...', duration: 700 },
];

export default function IntelligencePanel({ activeTab, setActiveTab, isAnalyzing, hasAnalyzed, currentDocument, lastAnalysis }) {
  const { isAdmin } = useAuth();

  if (isAnalyzing) {
    return <AnalysisLoadingState />;
  }

  if (!hasAnalyzed) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white shrink-0 overflow-x-auto">
        <TabButton
          active={activeTab === 'analysis'}
          onClick={() => setActiveTab('analysis')}
          label="Adversarial Review"
          icon={<AlertCircle size={15} />}
          badge={lastAnalysis?.findings?.length || null}
        />
        <TabButton
          active={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
          label="Consultant Chat"
          icon={<MessageSquare size={15} />}
        />
        {isAdmin && (
          <TabButton
            active={activeTab === 'factory'}
            onClick={() => setActiveTab('factory')}
            label="Knowledge Base"
            icon={<Database size={15} />}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        {activeTab === 'analysis' ? (
          <div className="pb-10 stagger-children">
            <ConflictHeatmap
              regulatorScore={lastAnalysis?.regulatorScore ?? 42}
              payerScore={lastAnalysis?.payerScore ?? 88}
              findings={lastAnalysis?.findings ?? []}
            />
            <SmartPivotCard findings={lastAnalysis?.findings ?? []} />

            {/* Detailed Findings — from real Bedrock analysis */}
            <div className="px-6 mt-8 space-y-3">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Detailed Findings</h3>
              {lastAnalysis?.findings?.length > 0 ? (
                lastAnalysis.findings.map((finding, idx) => (
                  <FindingCard
                    key={idx}
                    type={finding.severity === 'high' || finding.type === 'regulatory' ? 'risk' : 'money'}
                    title={finding.title || finding.category || 'Finding'}
                    text={finding.description || finding.text || finding.summary || ''}
                    section={finding.section || ''}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <CheckCircle size={24} className="mx-auto text-green-400 mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No critical findings detected</p>
                  <p className="text-xs text-slate-400 mt-1">The analysis did not flag any regulatory or payer issues.</p>
                </div>
              )}
            </div>
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

      <h3 className="text-slate-900 font-bold text-lg mb-1">Adversarial Council</h3>
      <p className="text-slate-400 text-sm mb-8">Agents are debating your protocol...</p>

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
      <h3 className="text-slate-700 font-semibold mb-1">Ready for Analysis</h3>
      <p className="text-slate-400 text-sm max-w-[220px] leading-relaxed">
        Click <span className="font-semibold text-brand-600">"Run Analysis"</span> to activate the Adversarial Council.
      </p>
    </div>
  );
}

/* ── Tab Button ── */
function TabButton({ active, onClick, label, icon, badge }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-semibold transition-all relative',
        active
          ? 'text-brand-600'
          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
      )}
    >
      {icon} {label}
      {badge && (
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            active ? 'bg-risk-100 text-risk-700' : 'bg-slate-100 text-slate-500'
          )}
        >
          {badge}
        </span>
      )}
      {active && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-brand-600 rounded-full" />}
    </button>
  );
}

/* ── Finding Card ── */
function FindingCard({ type, title, text, section }) {
  const isRisk = type === 'risk';
  return (
    <div
      className={cn(
        'p-4 rounded-xl border bg-white transition-all duration-200 hover:shadow-md cursor-pointer group animate-fade-in',
        isRisk
          ? 'border-risk-100 hover:border-risk-200'
          : 'border-money-100 hover:border-money-200'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 shrink-0', isRisk ? 'text-risk-500' : 'text-money-500')}>
          {isRisk ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn('text-sm font-semibold', isRisk ? 'text-risk-900' : 'text-money-900')}>
              {title}
            </h4>
            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
              {section}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}
