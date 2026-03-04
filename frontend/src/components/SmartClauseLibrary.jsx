import React, { useState, useEffect } from 'react';
import { BookOpen, Copy, Check, Search, Filter } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import { cn } from '../utils/cn';

export default function SmartClauseLibrary({ docId }) {
  const clauseLib = useAppStore(s => s.clauseLibrary);
  const setClauseLib = useAppStore(s => s.setClauseLibrary);
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (docId && !clauseLib) {
      loadClauses();
    }
  }, [docId]);

  const loadClauses = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const result = await strategicService.getClauses(docId);
      setClauseLib(result);
    } catch (err) {
      console.error('Clause load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyClause = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="h-12 w-12 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading clause library...</p>
      </div>
    );
  }

  const clauses = clauseLib?.clauses || [];
  const bySeverity = clauseLib?.by_severity || {};

  const filtered = clauses.filter(c => {
    if (filterSeverity !== 'all' && c.severity !== filterSeverity) return false;
    if (search && !c.clause_text.toLowerCase().includes(search.toLowerCase()) && !c.finding_title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (clauses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-3 border border-slate-200">
          <BookOpen size={24} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-semibold mb-1">Smart Clause Library</h3>
        <p className="text-slate-400 text-sm max-w-xs">No suggested clauses found. Run an analysis first to generate regulatory-ready protocol language.</p>
        {docId && (
          <button onClick={loadClauses} className="mt-3 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
            Load Clauses
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-brand-600" />
          <span className="text-sm font-bold text-slate-800">Smart Clauses ({clauses.length})</span>
        </div>
        <div className="flex gap-1.5 text-[10px]">
          {Object.entries(bySeverity).map(([sev, count]) => (
            count > 0 && (
              <span key={sev} className={cn('px-1.5 py-0.5 rounded-full font-bold',
                sev === 'critical' ? 'bg-red-100 text-red-700' :
                sev === 'high' ? 'bg-orange-100 text-orange-700' :
                sev === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              )}>
                {count} {sev}
              </span>
            )
          ))}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clauses..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
          />
        </div>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Clause Cards */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {filtered.map((clause) => (
          <div key={clause.id} className="p-3 bg-white rounded-lg border border-slate-200 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{clause.id}</span>
                <span className="text-xs font-bold text-slate-800">{clause.finding_title}</span>
                <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                  clause.severity === 'critical' ? 'bg-red-100 text-red-700' :
                  clause.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                  clause.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                )}>
                  {clause.severity}
                </span>
              </div>
              <button
                onClick={() => copyClause(clause.clause_text, clause.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-700 px-2 py-1 rounded bg-brand-50"
              >
                {copiedId === clause.id ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>

            <div className="p-2 bg-brand-50/50 rounded border border-brand-100 mb-1.5">
              <p className="text-[11px] text-slate-700 leading-relaxed font-mono">{clause.clause_text}</p>
            </div>

            {clause.suggestion && (
              <p className="text-[10px] text-slate-500 mb-1">{clause.suggestion}</p>
            )}

            <div className="flex flex-wrap gap-1">
              {clause.guideline_refs?.map((ref, i) => (
                <span key={i} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{typeof ref === 'string' ? ref : ref.code}</span>
              ))}
              {clause.jurisdictions?.map((j, i) => (
                <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{j}</span>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No clauses match your filter criteria.</p>
        )}
      </div>
    </div>
  );
}
