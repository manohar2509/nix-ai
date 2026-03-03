/**
 * GuidelineRefBadge — REQ-1: ICH/FDA/HTA Guideline Cross-Reference Display
 *
 * Small badge component that shows guideline references on findings.
 * Clickable to open the official guideline URL.
 * Color-coded by source type: ICH (blue), FDA (indigo), HTA (amber).
 */

const SOURCE_COLORS = {
  ICH: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
  FDA: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
  HTA: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
  EMA: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100',
  default: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
};

export default function GuidelineRefBadge({ refs }) {
  if (!refs || refs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {refs.map((ref, i) => {
        const sourceType = ref.source_type || (ref.code?.startsWith('FDA') ? 'FDA' : ref.code?.startsWith('NICE') || ref.code?.startsWith('IQWiG') || ref.code?.startsWith('CADTH') || ref.code?.startsWith('PBAC') ? 'HTA' : 'ICH');
        const colorClass = SOURCE_COLORS[sourceType] || SOURCE_COLORS.default;

        return (
          <a
            key={i}
            href={ref.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border transition-colors cursor-pointer ${colorClass}`}
            title={`${ref.title || ref.code}${ref.section ? ` § ${ref.section}` : ''}${ref.relevance ? `\n${ref.relevance}` : ''}`}
          >
            {sourceType !== 'ICH' && (
              <span className="text-[9px] font-bold opacity-60">{sourceType}</span>
            )}
            <span className="font-medium">{ref.code}</span>
            {ref.section && <span className="opacity-60">§{ref.section}</span>}
          </a>
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
