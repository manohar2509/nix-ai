import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, ArrowUpRight, ExternalLink, BookOpen, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import { useAppStore, useChat } from '../stores/useAppStore';
import { chatService } from '../services/chatService';
import { cn } from '../utils/cn';

const SUGGESTIONS = [
  'What are the main regulatory risks in this protocol that could trigger an FDA clinical hold?',
  'How does my sample size compare to similar Phase III trials, and what is the statistical power?',
  'Which protocol amendments would improve our chances of favorable HTA reimbursement decisions?',
];

// Clinical trial relevance keywords — at least one must be present to accept the question
const CLINICAL_KEYWORDS = [
  'trial', 'clinical', 'protocol', 'regulatory', 'fda', 'ema', 'ich', 'gcp',
  'endpoint', 'sample size', 'randomiz', 'placebo', 'blinding', 'blind',
  'phase', 'arm', 'cohort', 'dose', 'safety', 'efficacy', 'adverse',
  'inclusion', 'exclusion', 'eligibility', 'criteria', 'consent',
  'irb', 'ethics', 'dsmb', 'interim', 'futility', 'adaptive',
  'biomarker', 'surrogate', 'primary', 'secondary', 'outcome',
  'enrollment', 'recruit', 'site', 'investigator', 'sponsor',
  'submission', 'ind', 'nda', 'bla', 'cta', 'ema', 'pmda', 'nmpa',
  'compliance', 'audit', 'inspection', 'finding', 'risk',
  'amendment', 'deviation', 'waiver', 'payer', 'reimbursement',
  'hta', 'nice', 'iqwig', 'cadth', 'pbac', 'amnog', 'qaly',
  'comparator', 'control', 'superiority', 'non-inferiority', 'equivalence',
  'power', 'alpha', 'p-value', 'confidence interval', 'statistical',
  'oncology', 'cardio', 'neuro', 'immuno', 'rare disease', 'orphan',
  'recist', 'mace', 'overall survival', 'progression', 'response rate',
  'quality of life', 'pro', 'eq-5d', 'patient reported',
  'monitor', 'sae', 'susar', 'cspr', 'csr', 'ctd',
  'drug', 'biologic', 'therapy', 'treatment', 'intervention', 'medication',
  'pharmaceutical', 'medicine', 'therapeutic', 'indication', 'disease',
  'patient', 'subject', 'participant', 'population', 'demographic',
  'analysis', 'benchmark', 'score', 'guideline', 'guidance', 'regulation',
  'document', 'protocol', 'report', 'section', 'study', 'design',
  'nix', 'help', 'what can', 'how do', 'explain', 'summarize', 'summary',
];

const isRelevantQuestion = (text) => {
  const lower = text.toLowerCase();
  // Very short questions (< 4 words) are likely greetings/commands — allow them
  if (lower.split(/\s+/).length < 4) return true;
  return CLINICAL_KEYWORDS.some((kw) => lower.includes(kw));
};

export default function ChatInterface({ currentDocument }) {
  const { messages, isLoading: isChatLoading } = useChat();
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const updateChatMessage = useAppStore((state) => state.updateChatMessage);
  const setIsChatLoading = useAppStore((state) => state.setIsChatLoading);
  const setChatMessages = useAppStore((state) => state.setChatMessages);
  const showToast = useAppStore((state) => state.showToast);

  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const historyLoadedRef = useRef(false);

  const docId = currentDocument?.id || 'global';

  const handleClearChat = async () => {
    try {
      await chatService.clearChatHistory(docId);
      setChatMessages([]);
      setShowSuggestions(true);
      showToast({ type: 'success', title: 'Conversation cleared', message: 'Chat history has been removed.' });
    } catch {
      showToast({ type: 'error', title: 'Unable to clear', message: 'Could not clear conversation history. Please try again.' });
    }
  };

  const handleFeedback = async (messageId, rating) => {
    try {
      await chatService.submitFeedback(messageId, rating);
      showToast({ type: 'info', title: 'Thanks for your feedback', message: rating === 'positive' ? 'Glad that was helpful!' : 'We\'ll work to improve.' });
    } catch {
      // Silently fail on feedback
    }
  };

  // Load chat history on mount or doc change
  useEffect(() => {
    // Reset for new document
    historyLoadedRef.current = false;
    setChatMessages([]);
    setShowSuggestions(true);

    const loadHistory = async () => {
      try {
        const history = await chatService.getChatHistory(docId);
        if (history && history.length > 0) {
          const formatted = history.map((m) => ({
            id: m.id,
            role: m.role === 'assistant' ? 'ai' : m.role,
            text: m.text,
            citations: m.citations,
            kb_grounded: m.kb_grounded,
            grounding_source: m.grounding_source,
            time: m.created_at || '',
          }));
          setChatMessages(formatted);
          setShowSuggestions(false);
        }
      } catch {
        // No history or error — show suggestions
      }
      historyLoadedRef.current = true;
    };
    loadHistory();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading]);

  const handleSend = async (text) => {
    const msgText = text || input;
    if (!msgText.trim() || isChatLoading) return;

    // Validate clinical trial relevance
    if (!isRelevantQuestion(msgText)) {
      showToast({
        type: 'warning',
        title: 'Off-topic question',
        message: 'NIX AI is specialized for clinical trial protocol analysis. Please ask questions related to regulatory compliance, trial design, endpoints, payer strategy, or your protocol.',
      });
      return;
    }

    // Add user message optimistically
    const userMsg = { id: `user-${Date.now()}`, role: 'user', text: msgText, time: 'Just now' };
    addChatMessage(userMsg);
    setInput('');
    setIsChatLoading(true);
    setShowSuggestions(false);

    // Create a placeholder AI message that will be updated token-by-token
    const placeholderId = `ai-${Date.now()}`;
    const aiPlaceholder = {
      id: placeholderId,
      role: 'ai',
      text: '',
      citations: [],
      time: 'Just now',
      isStreaming: true,
    };
    addChatMessage(aiPlaceholder);

    try {
      await chatService.sendMessageStream(docId, msgText, {
        onStart: (data) => {
          // Update placeholder with real message ID from backend
          if (data.messageId) {
            updateChatMessage(placeholderId, { id: data.messageId });
          }
        },
        onToken: (chunk) => {
          // Append each token to the AI message text
          const currentMessages = useAppStore.getState().chatMessages;
          const msg = currentMessages.find(
            (m) => m.id === placeholderId || m.isStreaming
          );
          if (msg) {
            updateChatMessage(msg.id, { text: msg.text + chunk });
          }
        },
        onDone: (data) => {
          // Finalize the message with complete text, citations, and grounding metadata
          const currentMessages = useAppStore.getState().chatMessages;
          const msg = currentMessages.find(
            (m) => m.id === placeholderId || m.id === data.messageId || m.isStreaming
          );
          if (msg) {
            updateChatMessage(msg.id, {
              id: data.messageId || msg.id,
              text: data.fullText || msg.text,
              citations: data.citations || [],
              kb_grounded: data.kb_grounded,
              grounding_source: data.grounding_source,
              isStreaming: false,
            });
          }
        },
        onError: (errorMsg) => {
          // Update placeholder with error text
          updateChatMessage(placeholderId, {
            text: 'Sorry, I encountered an error processing your request. Please try again.',
            isStreaming: false,
          });
          showToast({ type: 'error', title: 'Unable to respond', message: 'Something went wrong. Please try sending your message again.' });
        },
      });
    } catch (err) {
      // Fallback: if streaming totally fails, update the placeholder
      updateChatMessage(placeholderId, {
        text: 'Sorry, I encountered an error processing your request. Please try again.',
        isStreaming: false,
      });
      showToast({ type: 'error', title: 'Unable to respond', message: 'Something went wrong. Please try sending your message again.' });
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 bg-white/90 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-brand-50 rounded-lg border border-brand-100">
              <Sparkles size={14} className="text-brand-600" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800">Regulatory AI Assistant</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-slate-500">Online · Powered by regulatory knowledge base</span>
              </div>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Clear conversation history"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onFeedback={handleFeedback} />
        ))}

        {/* Show typing indicator only when loading and no streaming message exists yet */}
        {isChatLoading && !messages.some((m) => m.isStreaming) && <TypingIndicator />}

        {/* Suggestion Chips */}
        {showSuggestions && !isChatLoading && (
          <div className="space-y-2 pt-2 animate-fade-in">
            <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Ask About Your Protocol</span>
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="w-full text-left p-3 bg-white border border-slate-100 rounded-xl text-xs text-slate-600 hover:border-brand-200 hover:bg-brand-50/30 hover:text-brand-700 transition-all duration-200 flex items-center justify-between group"
              >
                {s}
                <ArrowUpRight
                  size={12}
                  className="text-slate-300 group-hover:text-brand-500 transition-colors shrink-0 ml-2"
                />
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-white shrink-0">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about regulatory compliance, trial design, endpoints, or payer strategy..."
            disabled={isChatLoading}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isChatLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-600 rounded-lg text-white hover:bg-brand-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 text-center">AI-assisted analysis only · Does not constitute regulatory or legal advice · Always consult your regulatory affairs team</p>
      </div>
    </div>
  );
}

/* ── Message Bubble ── */
function MessageBubble({ msg, onFeedback }) {
  const isAI = msg.role === 'ai';
  const isStreaming = msg.isStreaming && isAI;
  const [showCitations, setShowCitations] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const hasCitations = isAI && msg.citations && msg.citations.length > 0;
  const isKBGrounded = msg.kb_grounded === true;
  const isAIInference = msg.grounding_source === 'regulatory_authority' || (!msg.kb_grounded && !!msg.grounding_source);

  return (
    <div className={cn('flex gap-3 animate-fade-in', !isAI && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-sm',
          isAI ? 'bg-brand-50 border-brand-100 text-brand-600' : 'bg-slate-900 border-slate-800 text-white'
        )}
      >
        {isAI ? <Sparkles size={13} /> : <User size={13} />}
      </div>
      <div className="max-w-[82%] space-y-1">
        <div
          className={cn(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
            isAI
              ? 'bg-slate-50 border border-slate-100 text-slate-700 rounded-tl-md'
              : 'bg-slate-800 text-white rounded-tr-md shadow-md'
          )}
        >
          {msg.text || (isStreaming ? '' : msg.text)}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-brand-500 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>

        {/* Citation pills */}
        {hasCitations && !isStreaming && (
          <div className="px-1">
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors py-1"
            >
              <BookOpen size={11} />
              <span>{msg.citations.length} source{msg.citations.length !== 1 ? 's' : ''} cited</span>
              {showCitations ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showCitations && (
              <div className="mt-1 space-y-1.5 animate-fade-in">
                {!isKBGrounded && (
                  <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 mb-1 leading-relaxed">
                    <span className="font-semibold">Official regulatory sources —</span>{' '}
                    These citations reference publicly published guidelines from ICH, FDA, EMA, and HTA bodies. Click any source to open the official document.
                  </div>
                )}
                {isKBGrounded && (
                  <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2 mb-1 leading-relaxed">
                    ✓ <span className="font-semibold">Sourced from your Document Library</span> — Answers are grounded on the regulatory documents your team has uploaded.
                  </div>
                )}
                {msg.citations.map((cit, i) => (
                  <CitationPill key={i} citation={cit} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Regulatory training data notice (no citations) */}
        {isAI && !isStreaming && !hasCitations && isAIInference && (
          <div className="px-1 mt-1">
            <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              Based on regulatory training data — populate your Document Library for document-specific answers
            </div>
          </div>
        )}

        {/* Feedback buttons for AI messages */}
        {isAI && !isStreaming && msg.text && (
          <div className="flex items-center gap-1 px-1 mt-1">
            {feedbackGiven ? (
              <span className="text-[10px] text-slate-400">Thanks for your feedback</span>
            ) : (
              <>
                <button
                  onClick={() => { setFeedbackGiven('positive'); onFeedback?.(msg.id, 'positive'); }}
                  className="p-1 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded transition-colors"
                  title="Helpful response"
                >
                  <ThumbsUp size={11} />
                </button>
                <button
                  onClick={() => { setFeedbackGiven('negative'); onFeedback?.(msg.id, 'negative'); }}
                  className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="Not helpful"
                >
                  <ThumbsDown size={11} />
                </button>
              </>
            )}
          </div>
        )}

        <div className={cn('text-[10px] text-slate-400 px-1', !isAI && 'text-right')}>
          {msg.time}
        </div>
      </div>
    </div>
  );
}

/* ── Source type config ── */
const SOURCE_CONFIG = {
  ICH: {
    label: 'ICH Guideline',
    colors: 'bg-blue-50 border-blue-200 text-blue-800',
    badge: 'bg-blue-100 text-blue-700',
    icon: '📋',
  },
  FDA: {
    label: 'FDA Guidance',
    colors: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    badge: 'bg-indigo-100 text-indigo-700',
    icon: '🏛️',
  },
  EMA: {
    label: 'EMA Guideline',
    colors: 'bg-violet-50 border-violet-200 text-violet-800',
    badge: 'bg-violet-100 text-violet-700',
    icon: '🇪🇺',
  },
  HTA: {
    label: 'HTA Standard',
    colors: 'bg-amber-50 border-amber-200 text-amber-800',
    badge: 'bg-amber-100 text-amber-700',
    icon: '💊',
  },
  knowledge_base: {
    label: 'Document Library',
    colors: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: '📂',
  },
};

/* ── Citation Pill ── */
function CitationPill({ citation }) {
  const sourceType = citation.source_type || 'knowledge_base';
  const config = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.knowledge_base;

  const hasUrl = citation.url && citation.url !== '#';
  const Tag = hasUrl ? 'a' : 'div';
  const linkProps = hasUrl
    ? { href: citation.url, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  // Build a clean display name from the source filename or code
  const displayName = citation.source
    ? citation.source.replace(/[-_]/g, ' ').replace(/\.(pdf|json|txt|md|docx?)$/i, '')
    : config.label;

  return (
    <Tag
      {...linkProps}
      className={cn(
        'flex items-start gap-2.5 px-3 py-2 rounded-lg border text-[11px] transition-all',
        config.colors,
        hasUrl && 'hover:shadow-sm hover:opacity-90 cursor-pointer'
      )}
      title={citation.text || citation.source}
    >
      {/* Source type icon */}
      <span className="text-sm shrink-0 mt-px">{config.icon}</span>

      <div className="flex-1 min-w-0">
        {/* Header row: type badge + document name */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', config.badge)}>
            {config.label}
          </span>
          {citation.section && (
            <span className="text-[10px] font-semibold opacity-70">§ {citation.section}</span>
          )}
          {citation.score != null && (
            <span className="text-[9px] opacity-50 ml-auto">{Math.round(citation.score * 100)}% match</span>
          )}
        </div>

        {/* Document / guideline name */}
        <div className="font-semibold mt-0.5 leading-tight">{displayName}</div>

        {/* Excerpt */}
        {citation.text && (
          <p className="text-[10px] opacity-70 line-clamp-2 mt-0.5 leading-relaxed">{citation.text}</p>
        )}

        {/* Link row */}
        {hasUrl && (
          <div className="flex items-center gap-1 mt-1 text-[10px] font-medium opacity-80">
            <ExternalLink size={9} />
            <span>Open official document</span>
          </div>
        )}
      </div>
    </Tag>
  );
}

/* ── Typing Indicator ── */
function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
        <Sparkles size={13} className="text-brand-600" />
      </div>
      <div className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-md flex gap-1.5 items-center">
        <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
        <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
        <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
      </div>
    </div>
  );
}
