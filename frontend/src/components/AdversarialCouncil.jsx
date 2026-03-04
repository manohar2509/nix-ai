import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users, ChevronDown, ChevronUp, Shield, DollarSign, Heart, Brain,
  Loader2, AlertTriangle, Star, ArrowRight, Play, Clock, CheckCircle2,
  Wrench, Eye, RotateCcw, Zap, MessageSquare, Target
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import { cn } from '../utils/cn';

// ═════════════════════════════════════════════════════════════════
// AGENT VISUAL CONFIGURATION
// ═════════════════════════════════════════════════════════════════
const AGENT_CONFIG = {
  Chairman: {
    name: 'Chairman',
    role: 'Board Chairman',
    icon: Users,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-700',
    gradient: 'from-slate-600 to-slate-800',
    avatar: '🎩',
  },
  Regulator: {
    name: 'Dr. No',
    role: 'The Regulator',
    icon: Shield,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    gradient: 'from-red-500 to-red-700',
    avatar: '🛡️',
  },
  Payer: {
    name: 'The Accountant',
    role: 'The Payer',
    icon: DollarSign,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-500 to-amber-700',
    avatar: '💰',
  },
  Patient: {
    name: 'The Voice',
    role: 'Patient Advocate',
    icon: Heart,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    gradient: 'from-emerald-500 to-emerald-700',
    avatar: '💚',
  },
};

const POLL_INTERVAL = 2500; // 2.5 seconds

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════
export default function AdversarialCouncil({ docId }) {
  // Store state
  const activeDebateId = useAppStore(s => s.activeDebateId);
  const debateStatus = useAppStore(s => s.debateStatus);
  const isDebatePolling = useAppStore(s => s.isDebatePolling);
  const debateError = useAppStore(s => s.debateError);
  const setActiveDebateId = useAppStore(s => s.setActiveDebateId);
  const setDebateStatus = useAppStore(s => s.setDebateStatus);
  const setIsDebatePolling = useAppStore(s => s.setIsDebatePolling);
  const setDebateError = useAppStore(s => s.setDebateError);
  const clearDebate = useAppStore(s => s.clearDebate);

  // Legacy state (for backward compatibility)
  const councilSession = useAppStore(s => s.councilSession);
  const isCouncilLoading = useAppStore(s => s.isCouncilLoading);
  const setCouncil = useAppStore(s => s.setCouncilSession);
  const setLoading = useAppStore(s => s.setIsCouncilLoading);

  // Local state
  const [expandedTurns, setExpandedTurns] = useState(new Set());
  const [animatedTurns, setAnimatedTurns] = useState(new Set());
  const [showToolDetails, setShowToolDetails] = useState(new Set());
  const transcriptRef = useRef(null);
  const pollTimerRef = useRef(null);
  const prevTurnCountRef = useRef(0);

  // ── Start Async Debate ──
  const handleStartDebate = useCallback(async () => {
    if (!docId) return;
    clearDebate();
    setDebateError(null);

    // Reset local state for a fresh debate
    prevTurnCountRef.current = 0;
    setAnimatedTurns(new Set());
    setExpandedTurns(new Set());
    setShowToolDetails(new Set());

    try {
      const response = await strategicService.startDebate(docId, 3);
      setActiveDebateId(response.debate_id);
      setIsDebatePolling(true);
    } catch (err) {
      console.error('Failed to start debate:', err);
      setDebateError(err.response?.data?.detail || 'Failed to start async debate. Falling back to sync mode...');
      // Fallback to sync council
      fallbackToSync();
    }
  }, [docId]);

  // ── Fallback to sync council (legacy) ──
  const fallbackToSync = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const result = await strategicService.runCouncil(docId);
      setCouncil(result);
    } catch (err) {
      console.error('Council (sync) failed:', err);
      setDebateError('Both async and sync council failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  // ── Poll for debate updates ──
  useEffect(() => {
    if (!activeDebateId || !isDebatePolling) return;

    const poll = async () => {
      try {
        const status = await strategicService.getDebateStatus(activeDebateId);
        setDebateStatus(status);

        // Animate new turns
        const transcript = status.transcript || [];
        if (transcript.length > prevTurnCountRef.current) {
          for (let i = prevTurnCountRef.current; i < transcript.length; i++) {
            setTimeout(() => {
              setAnimatedTurns(prev => new Set([...prev, i]));
            }, (i - prevTurnCountRef.current) * 300);
          }
          prevTurnCountRef.current = transcript.length;

          // Auto-expand the latest turn
          if (transcript.length > 0) {
            setExpandedTurns(prev => {
              const next = new Set(prev);
              next.add(transcript.length - 1);
              return next;
            });
          }

          // Auto-scroll to bottom
          if (transcriptRef.current) {
            setTimeout(() => {
              transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
            }, 100);
          }
        }

        // Stop polling when complete
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          setIsDebatePolling(false);
        }
      } catch (err) {
        console.error('Poll failed:', err);
        const httpStatus = err.response?.status;
        if (httpStatus === 404) {
          setDebateError('Debate not found. It may have been deleted.');
          setIsDebatePolling(false);
        } else if (httpStatus === 403) {
          setDebateError('Not authorized to view this debate.');
          setIsDebatePolling(false);
        }
        // For network/500 errors — keep polling (transient failures)
      }
    };

    poll(); // Initial poll
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeDebateId, isDebatePolling]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Toggle turn expansion ──
  const toggleTurn = (idx) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ── Toggle tool details ──
  const toggleToolDetails = (idx) => {
    setShowToolDetails(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Empty state (no debate yet)
  // ═══════════════════════════════════════════════════════════════
  if (!activeDebateId && !debateStatus && !councilSession && !isCouncilLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="relative mb-6">
          <div className="h-24 w-24 bg-gradient-to-br from-red-50 via-amber-50 to-emerald-50 rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
            <div className="grid grid-cols-3 gap-1">
              <span className="text-lg">🛡️</span>
              <span className="text-lg">🎩</span>
              <span className="text-lg">💰</span>
              <span className="col-span-3 text-center text-lg">💚</span>
            </div>
          </div>
          <div className="absolute -top-1 -right-1 h-5 w-5 bg-brand-600 rounded-full flex items-center justify-center">
            <Zap size={10} className="text-white" />
          </div>
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Virtual Boardroom</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-2">
          Launch a real-time multi-agent debate. Three AI agents with specialized tools
          will analyze your protocol from regulatory, financial, and patient perspectives.
        </p>
        <div className="flex gap-2 items-center text-[10px] text-slate-400 mb-5">
          <span className="flex items-center gap-1"><Shield size={10} className="text-red-500" /> FDA/ICH Search</span>
          <span>•</span>
          <span className="flex items-center gap-1"><DollarSign size={10} className="text-amber-500" /> Cost Calculator</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Heart size={10} className="text-emerald-500" /> Burden Scorer</span>
        </div>
        <button
          onClick={handleStartDebate}
          className="px-6 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl text-sm font-semibold hover:from-brand-700 hover:to-brand-800 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-2">
            <Play size={14} />
            Convene Boardroom
          </div>
        </button>

        {debateError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 max-w-sm">
            <AlertTriangle size={12} className="inline mr-1" />
            {debateError}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Legacy sync council result
  // ═══════════════════════════════════════════════════════════════
  if (councilSession && !activeDebateId) {
    return <LegacyCouncilView council={councilSession} onRestart={handleStartDebate} />;
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Loading (waiting for first poll)
  // ═══════════════════════════════════════════════════════════════
  if (isCouncilLoading || (activeDebateId && !debateStatus)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin" />
          <Users size={20} className="absolute inset-0 m-auto text-brand-600" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Assembling the Boardroom</h3>
        <p className="text-slate-400 text-sm max-w-xs text-center">
          Loading protocol data and preparing agent tools...
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Active debate (real-time animated transcript)
  // ═══════════════════════════════════════════════════════════════
  const status = debateStatus || {};
  const transcript = status.transcript || [];
  const isComplete = status.status === 'COMPLETED';
  const isFailed = status.status === 'FAILED';
  const isActive = status.status === 'IN_PROGRESS' || status.status === 'QUEUED';
  const verdict = status.final_verdict;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* ── Session Header ── */}
      <div className={cn(
        'rounded-xl p-4 text-white transition-all',
        isComplete ? 'bg-gradient-to-r from-slate-900 to-emerald-900' :
        isFailed ? 'bg-gradient-to-r from-slate-900 to-red-900' :
        'bg-gradient-to-r from-slate-900 to-brand-900'
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users size={16} />
            <h3 className="font-bold text-sm">
              {isComplete ? '✓ Boardroom Session Complete' :
               isFailed ? '✗ Boardroom Session Failed' :
               '● Live Boardroom Session'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="flex items-center gap-1.5 text-[10px] text-brand-300 bg-brand-900/50 px-2 py-1 rounded-full">
                <span className="h-1.5 w-1.5 bg-brand-400 rounded-full animate-pulse" />
                Round {status.current_round || 0}/{status.total_rounds || 3}
              </span>
            )}
            <span className="text-[10px] text-white/60">
              {status.elapsed_seconds ? `${Math.round(status.elapsed_seconds)}s` : ''}
            </span>
          </div>
        </div>

        {status.protocol_name && (
          <p className="text-slate-300 text-xs mb-2">Protocol: {status.protocol_name}</p>
        )}

        {/* Progress Bar */}
        {isActive && (
          <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
            <div
              className="bg-brand-400 h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${status.progress || 0}%` }}
            />
          </div>
        )}

        {isActive && status.current_topic && (
          <p className="text-brand-300 text-[10px] mt-1.5 italic">
            <Target size={10} className="inline mr-1" />
            Debating: {status.current_topic}
          </p>
        )}
      </div>

      {/* ── Score Cards ── */}
      {status.scores && Object.keys(status.scores).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'regulator', label: 'Regulatory', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
            { key: 'payer', label: 'Payer', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
            { key: 'global_readiness', label: 'Readiness', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          ].map(({ key, label, color, bg, border }) => (
            <div key={key} className={cn('rounded-lg p-2 border text-center', bg, border)}>
              <div className="text-[9px] uppercase font-bold text-slate-400">{label}</div>
              <div className={cn('text-xl font-bold', color)}>
                {status.scores[key] ?? '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Real-Time Transcript ── */}
      <div
        ref={transcriptRef}
        className="space-y-2 max-h-[500px] overflow-y-auto pr-1 scroll-smooth"
      >
        {transcript.map((turn, idx) => {
          const agentKey = turn.agent || 'Chairman';
          const config = AGENT_CONFIG[agentKey] || AGENT_CONFIG.Chairman;
          const isExpanded = expandedTurns.has(idx);
          const isToolsVisible = showToolDetails.has(idx);
          const toolCalls = turn.tool_calls || [];
          const hasTools = toolCalls.length > 0;
          const isVerdict = turn.verdict != null;

          return (
            <div
              key={idx}
              className={cn(
                'rounded-xl border overflow-hidden transition-all duration-500',
                config.bg, config.border,
                isVerdict ? 'ring-2 ring-brand-300' : '',
              )}
              style={{
                animation: 'slideUp 0.4s ease-out',
                animationDelay: `${Math.min(idx * 100, 500)}ms`,
                animationFillMode: 'backwards',
              }}
            >
              {/* Turn Header */}
              <button
                onClick={() => toggleTurn(idx)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{config.avatar}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">{config.name}</span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', config.badge)}>
                        {turn.role || config.role}
                      </span>
                      {turn.round_number > 0 && (
                        <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                          R{turn.round_number}
                        </span>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="text-[11px] text-slate-500 truncate max-w-[280px]">
                        {(turn.content || '').substring(0, 80)}{(turn.content || '').length > 80 ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasTools && (
                    <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Wrench size={8} />
                      {toolCalls.length}
                    </span>
                  )}
                  {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-inherit">
                  {/* Main argument */}
                  <div className="text-xs text-slate-700 leading-relaxed mt-2 whitespace-pre-line">
                    {turn.content}
                  </div>

                  {/* Topic badge */}
                  {turn.topic && (
                    <div className="inline-flex items-center gap-1 text-[9px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      <Target size={8} />
                      {turn.topic}
                    </div>
                  )}

                  {/* Tool Calls (the differentiator!) */}
                  {hasTools && (
                    <div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleToolDetails(idx); }}
                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 transition-colors mt-1"
                      >
                        <Wrench size={10} />
                        <span className="font-semibold">{toolCalls.length} tool{toolCalls.length > 1 ? 's' : ''} used</span>
                        <span className="text-slate-400">— {isToolsVisible ? 'hide' : 'show data'}</span>
                      </button>

                      {isToolsVisible && (
                        <div className="mt-1.5 space-y-1.5">
                          {toolCalls.map((tc, tIdx) => (
                            <div key={tIdx} className="bg-white/70 rounded-lg p-2 border border-slate-200 text-[10px]">
                              <div className="flex items-center gap-1 font-bold text-slate-600 mb-1">
                                <Wrench size={9} className="text-brand-500" />
                                <span className="font-mono">{tc.tool}</span>
                              </div>
                              {tc.input && (
                                <div className="text-slate-400 mb-1 font-mono">
                                  Input: {typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input).substring(0, 150)}
                                </div>
                              )}
                              <div className="text-slate-600 bg-slate-50 rounded p-1.5 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-[9px] leading-relaxed">
                                {tc.output}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verdict details */}
                  {isVerdict && turn.verdict && (
                    <VerdictCard verdict={turn.verdict} />
                  )}

                  {/* Error */}
                  {turn.error && (
                    <div className="text-[10px] text-red-600 bg-red-50 rounded p-2 border border-red-200">
                      <AlertTriangle size={10} className="inline mr-1" />
                      {turn.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator while active */}
        {isActive && (
          <div className="flex items-center gap-2 px-3 py-3 bg-white/50 rounded-xl border border-dashed border-slate-200">
            <div className="flex gap-1">
              <span className="h-2 w-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {status.current_topic ? `Analyzing: ${status.current_topic}` : 'Agent is thinking...'}
            </span>
          </div>
        )}
      </div>

      {/* ── Final Verdict (when complete) ── */}
      {isComplete && verdict && (
        <VerdictCard verdict={verdict} isStandalone />
      )}

      {/* ── Error State ── */}
      {isFailed && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <AlertTriangle size={16} />
            <span className="text-sm font-bold">Debate Failed</span>
          </div>
          <p className="text-xs text-red-500">{status.error || 'An unexpected error occurred.'}</p>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="flex gap-2">
        <button
          onClick={() => { clearDebate(); handleStartDebate(); }}
          disabled={isActive}
          className={cn(
            'flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5',
            isActive
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
          )}
        >
          <RotateCcw size={12} />
          {isComplete ? 'New Session' : isFailed ? 'Retry' : 'Debating...'}
        </button>
      </div>

      {/* Slide-up animation keyframes */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════

function VerdictCard({ verdict, isStandalone = false }) {
  if (!verdict) return null;

  const currentScores = verdict.current_scores || {};
  const optimizedScores = verdict.optimized_scores || {};
  const tradeoffs = verdict.key_tradeoffs || [];
  const actions = verdict.priority_actions || [];

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden',
      isStandalone ? 'bg-gradient-to-br from-brand-50 to-emerald-50 border-brand-200' : 'bg-brand-50/50 border-brand-200',
    )}>
      {isStandalone && (
        <div className="bg-gradient-to-r from-brand-600 to-emerald-600 px-4 py-2.5">
          <div className="flex items-center gap-2 text-white">
            <CheckCircle2 size={14} />
            <span className="text-xs font-bold">Final Verdict — Board Consensus</span>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Executive Summary */}
        {verdict.executive_summary && (
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {verdict.executive_summary}
          </p>
        )}

        {/* Confidence */}
        {verdict.confidence_level && (
          <span className={cn(
            'inline-block text-[9px] px-2 py-0.5 rounded-full font-bold uppercase',
            verdict.confidence_level === 'high' ? 'bg-emerald-100 text-emerald-700' :
            verdict.confidence_level === 'medium' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700',
          )}>
            {verdict.confidence_level} confidence
          </span>
        )}

        {/* Score Comparison */}
        {(currentScores.regulatory || optimizedScores.regulatory) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2.5 border border-slate-200">
              <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Current Scores</div>
              <div className="flex gap-3">
                <div>
                  <span className="text-lg font-bold text-slate-800">{currentScores.regulatory || '—'}</span>
                  <span className="text-[9px] text-slate-400 ml-0.5">Reg</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-slate-800">{currentScores.payer || '—'}</span>
                  <span className="text-[9px] text-slate-400 ml-0.5">Pay</span>
                </div>
              </div>
            </div>
            <div className="bg-brand-50 rounded-lg p-2.5 border border-brand-200">
              <div className="text-[9px] text-brand-600 uppercase font-bold mb-1">After Optimization</div>
              <div className="flex gap-3">
                <div>
                  <span className="text-lg font-bold text-brand-700">{optimizedScores.regulatory || '—'}</span>
                  <span className="text-[9px] text-brand-400 ml-0.5">Reg</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-brand-700">{optimizedScores.payer || '—'}</span>
                  <span className="text-[9px] text-brand-400 ml-0.5">Pay</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Key Tradeoffs */}
        {tradeoffs.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-amber-700 uppercase mb-1">⚖️ Key Tradeoffs</div>
            <ul className="space-y-0.5">
              {tradeoffs.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                  <ArrowRight size={9} className="mt-1 text-amber-500 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Priority Actions */}
        {actions.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-brand-700 uppercase mb-1">🎯 Priority Actions</div>
            <ul className="space-y-0.5">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                  <CheckCircle2 size={9} className="mt-1 text-brand-500 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}


function LegacyCouncilView({ council, onRestart }) {
  const [expandedRound, setExpandedRound] = useState(0);

  const verdict = council.final_verdict || {};
  const rounds = council.rounds || [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Users size={18} />
          <h3 className="font-bold">Adversarial Council Session (Classic)</h3>
        </div>
        <p className="text-slate-300 text-sm">{council.opening_summary}</p>
      </div>

      {rounds.map((round, idx) => (
        <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => setExpandedRound(expandedRound === idx ? -1 : idx)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                Round {round.round_number}
              </span>
              <span className="text-sm font-semibold text-slate-800">{round.topic}</span>
            </div>
            {expandedRound === idx ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>

          {expandedRound === idx && (
            <div className="p-4 space-y-3">
              {['dr_no', 'the_accountant', 'patient_advocate'].map((agentKey) => {
                const agent = round[agentKey];
                const lookup = {
                  dr_no: AGENT_CONFIG.Regulator,
                  the_accountant: AGENT_CONFIG.Payer,
                  patient_advocate: AGENT_CONFIG.Patient,
                };
                const style = lookup[agentKey];
                if (!agent || !style) return null;
                return (
                  <div key={agentKey} className={cn('rounded-lg p-3 border', style.bg, style.border)}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <style.icon size={14} className={style.color} />
                      <span className="text-xs font-bold text-slate-800">{style.name}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', style.badge)}>{style.role}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-700 mb-1">{agent.position}</p>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{agent.argument}</p>
                  </div>
                );
              })}

              {round.mediator && (
                <div className="rounded-lg p-3 bg-brand-50 border border-brand-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Brain size={14} className="text-brand-600" />
                    <span className="text-xs font-bold text-brand-700">NIX AI Mediator</span>
                  </div>
                  <p className="text-xs text-slate-700">{round.mediator.resolution}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={onRestart}
        className="w-full py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-700 rounded-lg hover:from-brand-700 hover:to-brand-800 transition-all shadow-sm flex items-center justify-center gap-1.5"
      >
        <Zap size={12} />
        Upgrade to Real-Time Boardroom Debate
      </button>
    </div>
  );
}
