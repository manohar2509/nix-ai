/**
 * GuidelineRefBadge — REQ-1: ICH/FDA/HTA Guideline Cross-Reference Display
 *
 * Renders clickable citation badges linking directly to official regulatory documents.
 * Colour-coded by authority: ICH (blue), FDA (indigo), EMA (violet), HTA (amber).
 * Each badge opens the official PDF or web page on click.
 */

import { ExternalLink } from 'lucide-react';

const SOURCE_CONFIG = {
  ICH: {
    label: 'ICH',
    pill: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
    dot: 'bg-blue-500',
  },
  FDA: {
    label: 'FDA',
    pill: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
    dot: 'bg-indigo-500',
  },
  EMA: {
    label: 'EMA',
    pill: 'bg-violet-50 border-violet-200 text-violet-800 hover:bg-violet-100',
    dot: 'bg-violet-500',
  },
  HTA: {
    label: 'HTA',
    pill: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
    dot: 'bg-amber-500',
  },
  default: {
    label: 'REF',
    pill: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
    dot: 'bg-blue-500',
  },
};

function inferSourceType(ref) {
  if (ref.source_type) return ref.source_type;
  const code = ref.code || '';
  if (code.startsWith('NICE') || code.startsWith('IQWiG') || code.startsWith('CADTH') || code.startsWith('PBAC') || code.startsWith('AMNOG')) return 'HTA';
  if (code.startsWith('FDA') || code.startsWith('21 CFR')) return 'FDA';
  if (code.startsWith('EMA') || code.startsWith('CHMP') || code.startsWith('EMEA')) return 'EMA';
  return 'ICH';
}

export default function GuidelineRefBadge({ refs }) {
  if (!refs || refs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {refs.map((ref, i) => {
        const sourceType = inferSourceType(ref);
        const config = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.default;
        const hasUrl = ref.url && ref.url !== '#';

        // Tooltip: full title + section + relevance for hover context
        const tooltip = [
          ref.title || ref.code,
          ref.section ? `Section ${ref.section}` : null,
          ref.relevance || null,
          hasUrl ? '↗ Click to open official document' : null,
        ].filter(Boolean).join('\n');

        const Tag = hasUrl ? 'a' : 'span';
        const linkProps = hasUrl
          ? { href: ref.url, target: '_blank', rel: 'noopener noreferrer' }
          : {};

        return (
          <Tag
            key={i}
            {...linkProps}
            title={tooltip}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${config.pill} ${hasUrl ? 'cursor-pointer' : ''}`}
          >
            {/* Authority dot */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />

            {/* Authority label */}
            <span className="text-[9px] font-bold opacity-60 uppercase tracking-wide">{config.label}</span>

            {/* Guideline code */}
            <span className="font-semibold">{ref.code}</span>

            {/* Section */}
            {ref.section && (
              <span className="opacity-60 font-normal">&sect;{ref.section}</span>
            )}

            {/* External link icon when URL is available */}
            {hasUrl && <ExternalLink size={9} className="opacity-50 shrink-0" />}
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * SmartClauseBadge — REQ-7: Copy-paste protocol clause suggestion
 */
export function SmartClauseBadge({ clause }) {
  if (!clause) return null;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(clause);
  };

  return (
    <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-emerald-700 font-medium uppercase">Suggested Clause</span>
        <button
          onClick={handleCopy}
          className="text-[11px] text-emerald-600 hover:text-emerald-800 px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 transition-colors"
        >
          📋 Copy
        </button>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed italic">"{clause}"</p>
    </div>
  );
}
