import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, ChevronRight, ChevronLeft, Play, LayoutDashboard,
  FileText, Sliders, MessageSquare, GitCompare, Briefcase,
  Upload, ShieldCheck, Sparkles, Check, SkipForward,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '../utils/cn';

const TOUR_STORAGE_KEY = 'nixai-tour-completed';

/**
 * Tour steps - each step targets a specific area of the platform
 * Steps without a `target` selector show a centered modal instead
 */
const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to NIX AI',
    description: 'NIX AI is your AI-powered regulatory intelligence platform for clinical trial protocols. Let\u2019s walk through the key features so you can get the most out of the platform.',
    icon: <ShieldCheck size={24} className="text-brand-500" />,
    position: 'center',
  },
  {
    id: 'sidebar',
    title: 'Navigation Sidebar',
    description: 'The sidebar is your main navigation hub. Access the Dashboard, Protocol Review, Compare Protocols, Analysis History, and Deal Room from here. Your uploaded protocols also appear in the sidebar for quick access.',
    icon: <LayoutDashboard size={20} className="text-brand-500" />,
    target: '[data-tour="sidebar"]',
    position: 'right',
  },
  {
    id: 'upload',
    title: 'Upload Protocols',
    description: 'Click the "Upload Protocol" button to upload your clinical trial protocol (PDF format, up to 50MB). The platform will automatically extract and process the document for analysis.',
    icon: <Upload size={20} className="text-brand-500" />,
    target: '[data-tour="upload-btn"]',
    position: 'right',
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'The Dashboard gives you a bird\u2019s-eye view of all your protocols — compliance scores, recent analyses, risk distribution, and quick stats. Click on any card to drill into details.',
    icon: <LayoutDashboard size={20} className="text-brand-500" />,
    target: '[data-tour="dashboard-nav"]',
    position: 'right',
    action: 'dashboard',
  },
  {
    id: 'protocol-review',
    title: 'Protocol Review',
    description: 'This is where the magic happens. Upload a protocol, click "Run Regulatory Analysis", and the AI will review it against ICH, FDA, EMA guidelines and payer requirements. View findings, compliance scores, and recommendations.',
    icon: <FileText size={20} className="text-brand-500" />,
    target: '[data-tour="protocol-nav"]',
    position: 'right',
  },
  {
    id: 'intelligence',
    title: 'Strategic Intelligence',
    description: 'After analysis, explore powerful strategic tools: Adversarial Council debates, Friction Heatmaps, Cost Architecture analysis, Payer Simulations, Submission Strategy, and more — all accessible from the Intelligence Panel tabs.',
    icon: <Sparkles size={20} className="text-brand-500" />,
    position: 'center',
  },
  {
    id: 'chat',
    title: 'AI Chat Assistant',
    description: 'Ask any question about your protocol, regulatory requirements, or analysis findings. The AI chat provides citation-backed answers grounded in your protocol context and the regulatory knowledge base.',
    icon: <MessageSquare size={20} className="text-brand-500" />,
    position: 'center',
  },
  {
    id: 'compare',
    title: 'Compare Protocols',
    description: 'Upload multiple protocol versions and compare them side-by-side. Track how regulatory and payer risk scores change across iterations to see which amendments improved compliance.',
    icon: <GitCompare size={20} className="text-brand-500" />,
    target: '[data-tour="compare-nav"]',
    position: 'right',
  },
  {
    id: 'dealroom',
    title: 'Deal Room',
    description: 'Generate investor-ready reports with portfolio risk analysis and regulatory scorecards. Perfect for business development, licensing discussions, and board-level presentations.',
    icon: <Briefcase size={20} className="text-brand-500" />,
    target: '[data-tour="dealroom-nav"]',
    position: 'right',
  },
  {
    id: 'settings',
    title: 'Settings & Preferences',
    description: 'Customize your analysis sensitivity, risk thresholds, notifications, and display preferences. Visit the FAQ section for detailed guidance on using the platform.',
    icon: <Sliders size={20} className="text-brand-500" />,
    target: '[data-tour="settings-nav"]',
    position: 'right',
  },
  {
    id: 'complete',
    title: 'You\u2019re All Set!',
    description: 'You now know the key features of NIX AI. Start by uploading a clinical trial protocol and running your first regulatory analysis. You can replay this tour anytime from Settings > FAQ & Help.',
    icon: <Check size={24} className="text-green-500" />,
    position: 'center',
  },
];


export default function PlatformTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const [highlightStyle, setHighlightStyle] = useState(null);
  const tooltipRef = useRef(null);
  const setActiveView = useAppStore((s) => s.setActiveView);

  // Check if user has completed the tour before
  const hasCompletedTour = useCallback(() => {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }, []);

  // Listen for tour start events
  useEffect(() => {
    const handleStartTour = () => {
      setCurrentStep(0);
      setIsActive(true);
    };

    window.addEventListener('nixai-start-tour', handleStartTour);
    return () => window.removeEventListener('nixai-start-tour', handleStartTour);
  }, []);

  // Auto-start tour for first-time users
  useEffect(() => {
    if (!hasCompletedTour()) {
      // Delay to let the dashboard render first
      const timer = setTimeout(() => {
        setCurrentStep(0);
        setIsActive(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour]);

  // Position the tooltip based on target element
  useEffect(() => {
    if (!isActive) return;

    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    if (step.position === 'center' || !step.target) {
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      setHighlightStyle(null);
      return;
    }

    // Find target element
    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      // Target not found, show centered
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      setHighlightStyle(null);
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const padding = 8;

    // Highlight the target
    setHighlightStyle({
      position: 'fixed',
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      borderRadius: '12px',
    });

    // Position tooltip based on step.position
    const tooltipWidth = 380;
    const tooltipMargin = 16;

    if (step.position === 'right') {
      setTooltipStyle({
        position: 'fixed',
        top: Math.max(20, Math.min(rect.top, window.innerHeight - 320)),
        left: rect.right + tooltipMargin,
      });
    } else if (step.position === 'bottom') {
      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + tooltipMargin,
        left: Math.max(20, rect.left + rect.width / 2 - tooltipWidth / 2),
      });
    } else if (step.position === 'left') {
      setTooltipStyle({
        position: 'fixed',
        top: Math.max(20, rect.top),
        left: rect.left - tooltipWidth - tooltipMargin,
      });
    } else {
      setTooltipStyle({
        position: 'fixed',
        top: rect.top - tooltipMargin - 200,
        left: Math.max(20, rect.left),
      });
    }
  }, [isActive, currentStep]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const nextStep = TOUR_STEPS[currentStep + 1];
      // Execute navigation action if step has one
      if (nextStep.action === 'dashboard') {
        setActiveView('dashboard');
      }
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTour = () => {
    setIsActive(false);
    setCurrentStep(0);
    setHighlightStyle(null);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  const skipTour = () => {
    completeTour();
  };

  if (!isActive) return null;

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={skipTour}
      />

      {/* Target Highlight */}
      {highlightStyle && (
        <div
          className="fixed z-[9999] pointer-events-none transition-all duration-300 ease-out"
          style={highlightStyle}
        >
          <div className="absolute inset-0 border-2 border-brand-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] bg-transparent" />
          <div className="absolute inset-0 border-2 border-brand-400/60 rounded-xl animate-pulse" />
        </div>
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-[380px] animate-fade-in"
        style={tooltipStyle}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1 bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Step Counter */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 bg-brand-50 rounded-xl flex items-center justify-center">
                  {step.icon}
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Step {currentStep + 1} of {TOUR_STEPS.length}
                </span>
              </div>
              <button
                onClick={skipTour}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Close tour"
              >
                <X size={16} />
              </button>
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {TOUR_STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    idx === currentStep
                      ? 'w-6 bg-brand-500'
                      : idx < currentStep
                        ? 'w-1.5 bg-brand-300'
                        : 'w-1.5 bg-slate-200'
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              )}
              {isFirst && !isLast && (
                <button
                  onClick={skipTour}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                >
                  <SkipForward size={13} />
                  Skip Tour
                </button>
              )}
              <button
                onClick={handleNext}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all shadow-sm',
                  isLast
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                )}
              >
                {isLast ? (
                  <>
                    <Check size={14} />
                    Get Started
                  </>
                ) : isFirst ? (
                  <>
                    Let's Go
                    <ChevronRight size={14} />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


/**
 * Small button component to trigger the tour from anywhere
 */
export function TourTriggerButton({ className }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('nixai-start-tour'))}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors',
        className
      )}
    >
      <Play size={13} />
      Platform Tour
    </button>
  );
}
