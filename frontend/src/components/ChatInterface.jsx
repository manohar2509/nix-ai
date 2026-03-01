import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, ArrowUpRight } from 'lucide-react';
import { useAppStore, useChat } from '../stores/useAppStore';
import { chatService } from '../services/chatService';
import { cn } from '../utils/cn';

const SUGGESTIONS = [
  'How do I satisfy the FDA without exceeding budget?',
  "What's the risk if I keep N=50?",
  'Draft an amendment for the Eastern Europe pivot',
];

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
          // Finalize the message with complete text and citations
          const currentMessages = useAppStore.getState().chatMessages;
          const msg = currentMessages.find(
            (m) => m.id === placeholderId || m.id === data.messageId || m.isStreaming
          );
          if (msg) {
            updateChatMessage(msg.id, {
              id: data.messageId || msg.id,
              text: data.fullText || msg.text,
              citations: data.citations || [],
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
          showToast({ type: 'error', title: 'Chat error', message: errorMsg });
        },
      });
    } catch (err) {
      // Fallback: if streaming totally fails, update the placeholder
      updateChatMessage(placeholderId, {
        text: 'Sorry, I encountered an error processing your request. Please try again.',
        isStreaming: false,
      });
      showToast({ type: 'error', title: 'Chat error', message: err.message || 'Failed to get response' });
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 bg-white/80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-50 rounded-lg border border-brand-100">
            <Sparkles size={14} className="text-brand-600" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-700">NIX Adversarial Consultant</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-slate-400">Online · Protocol NX-202</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Show typing indicator only when loading and no streaming message exists yet */}
        {isChatLoading && !messages.some((m) => m.isStreaming) && <TypingIndicator />}

        {/* Suggestion Chips */}
        {showSuggestions && !isChatLoading && (
          <div className="space-y-2 pt-2 animate-fade-in">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Suggested Questions</span>
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
            placeholder="Ask the Adversarial Council..."
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
        <p className="text-[10px] text-slate-400 mt-2 text-center">AI analysis only · Not clinical or legal advice</p>
      </div>
    </div>
  );
}

/* ── Message Bubble ── */
function MessageBubble({ msg }) {
  const isAI = msg.role === 'ai';
  const isStreaming = msg.isStreaming && isAI;
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
              : 'bg-slate-900 text-white rounded-tr-md shadow-md'
          )}
        >
          {msg.text || (isStreaming ? '' : msg.text)}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-brand-500 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>
        <div className={cn('text-[10px] text-slate-400 px-1', !isAI && 'text-right')}>
          {msg.time}
        </div>
      </div>
    </div>
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
