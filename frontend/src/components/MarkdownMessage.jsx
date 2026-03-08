import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';

/**
 * MarkdownMessage — Renders AI chat responses as rich, styled Markdown.
 *
 * Supports: headings, bold, italic, lists, tables, blockquotes, inline code,
 * code blocks, links, and horizontal rules.
 *
 * Guideline references like **ICH E6(R3) Section 5.2.1** are rendered with
 * emphasis. Links open in new tabs for safety.
 */
function MarkdownMessage({ text, isStreaming = false }) {
  if (!text) return null;

  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ──────────────────────────────────────
          h1: ({ children }) => (
            <h3 className="text-sm font-bold text-slate-800 mt-3 mb-1.5 first:mt-0 border-b border-slate-200 pb-1">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h4 className="text-[13px] font-bold text-slate-800 mt-3 mb-1 first:mt-0">
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5 className="text-xs font-bold text-slate-700 mt-2 mb-1 first:mt-0">
              {children}
            </h5>
          ),
          h4: ({ children }) => (
            <h6 className="text-xs font-semibold text-slate-700 mt-2 mb-0.5 first:mt-0">
              {children}
            </h6>
          ),

          // ── Paragraphs ────────────────────────────────────
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-slate-700 mb-2 last:mb-0">
              {children}
            </p>
          ),

          // ── Bold / Italic ─────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-800">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-600">{children}</em>
          ),

          // ── Lists ─────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 mb-2 space-y-0.5 text-sm text-slate-700">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 mb-2 space-y-0.5 text-sm text-slate-700">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">{children}</li>
          ),

          // ── Blockquotes (guideline excerpts) ──────────────
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-brand-300 bg-brand-50/40 pl-3 py-1.5 my-2 rounded-r-lg text-xs text-slate-600 italic">
              {children}
            </blockquote>
          ),

          // ── Inline code (guideline codes like ICH E6(R3)) ─
          code: ({ inline, children, className }) => {
            if (inline) {
              return (
                <code className="bg-blue-50 text-blue-800 text-[11px] font-mono px-1.5 py-0.5 rounded border border-blue-100">
                  {children}
                </code>
              );
            }
            // Code block
            return (
              <pre className="bg-slate-800 text-slate-100 text-[11px] font-mono p-3 rounded-lg my-2 overflow-x-auto">
                <code className={className}>{children}</code>
              </pre>
            );
          },

          // ── Tables (jurisdiction comparison, etc.) ────────
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-slate-50/50">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left font-semibold text-slate-700 text-[11px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 text-slate-600">{children}</td>
          ),

          // ── Links ─────────────────────────────────────────
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-800 underline decoration-brand-300 underline-offset-2 inline-flex items-center gap-0.5"
            >
              {children}
              <ExternalLink size={9} className="shrink-0 opacity-60" />
            </a>
          ),

          // ── Horizontal rules ──────────────────────────────
          hr: () => <hr className="my-3 border-slate-200" />,
        }}
      >
        {text}
      </ReactMarkdown>

      {/* Streaming cursor */}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-brand-500 ml-0.5 animate-pulse align-text-bottom" />
      )}
    </div>
  );
}

export default memo(MarkdownMessage);
