/**
 * ComparisonView — REQ-6: Protocol Comparison Engine
 *
 * Full-page view for comparing multiple protocols side by side.
 * Users select 2-5 documents, then see a structured comparison.
 */

import { useState, useEffect, useRef } from 'react';
import { GitCompare, FileText, ChevronRight, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { useAppStore, useRegulatory, useDocuments } from '../stores/useAppStore';
import { triggerComparison, listComparisons, getComparison } from '../services/regulatoryService';
import { analysisService } from '../services/analysisService';
import { cn } from '../utils/cn';

export default function ComparisonView() {
  const { documents } = useDocuments();
  const { comparisons, activeComparison, isComparing } = useRegulatory();
  const store = useAppStore();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [error, setError] = useState(null);
  const pollIntervalRef = useRef(null);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    loadComparisons();
  }, []);

  const loadComparisons = async () => {
    try {
      const data = await listComparisons();
      store.setComparisons(data.comparisons || []);
    } catch (err) {
      console.error('Failed to load comparisons:', err);
    }
  };

  const toggleDoc = (docId) => {
    setSelectedDocs(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : prev.length < 5
          ? [...prev, docId]
          : prev
    );
  };

  const handleCompare = async () => {
    if (selectedDocs.length < 2) return;
    setError(null);
    store.setIsComparing(true);

    try {
      const result = await triggerComparison(selectedDocs);

      if (result.inline || result.status === 'COMPLETE') {
        const cmpData = await getComparison(result.cmpId);
        store.setActiveComparison(cmpData);
        await loadComparisons();
      } else {
        const jobId = result.jobId;
        const cmpId = result.cmpId;
        pollIntervalRef.current = setInterval(async () => {
          try {
            const status = await analysisService.getAnalysisStatus(jobId);
            if (status.status === 'COMPLETE') {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              const cmpData = await getComparison(cmpId);
              store.setActiveComparison(cmpData);
              await loadComparisons();
              store.setIsComparing(false);
            } else if (status.status === 'FAILED') {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setError('The comparison could not be completed. Please try again.');
              store.setIsComparing(false);
            }
          } catch {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            store.setIsComparing(false);
          }
        }, 2000);
        return;
      }
    } catch (err) {
      setError('The comparison could not be completed. Please try again.');
    } finally {
      store.setIsComparing(false);
    }
  };

  const loadComparison = async (cmpId) => {
    try {
      const data = await getComparison(cmpId);
      store.setActiveComparison(data);
    } catch (err) {
      console.error('Failed to load comparison:', err);
    }
  };

  const analyzedDocs = documents.filter(d => d.status === 'analyzed');

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <GitCompare size={24} className="text-brand-600" />
              Protocol Comparison
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Select 2–5 analyzed clinical trial protocols to compare across regulatory compliance, payer readiness, and trial design dimensions.
            </p>
          </div>
          <button
            onClick={() => setActiveView('dashboard')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
        </div>

        {/* Document Selection */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Select Protocols to Compare</h3>
              <p className="text-xs text-slate-400 mt-0.5">{selectedDocs.length} of 5 selected — choose protocols that have completed analysis</p>
            </div>
            <div className="h-8 w-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600">
              <FileText size={16} />
            </div>
          </div>

          {analyzedDocs.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-500 font-medium">No analyzed protocols available</p>
              <p className="text-xs text-slate-400 mt-1">Upload and run regulatory analysis on your clinical trial protocols first. Only protocols with completed analyses can be compared.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {analyzedDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => toggleDoc(doc.id)}
                  className={cn(
                    'p-3 rounded-xl border text-left transition-all text-sm',
                    selectedDocs.includes(doc.id)
                      ? 'border-brand-300 bg-brand-50/50 text-slate-800 ring-1 ring-brand-200'
                      : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {selectedDocs.includes(doc.id) && (
                      <CheckCircle size={14} className="text-brand-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate text-slate-800">{doc.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            <button
              onClick={handleCompare}
              disabled={selectedDocs.length < 2 || isComparing}
              className={cn(
                'ml-auto flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-all',
                selectedDocs.length < 2 || isComparing
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-brand-600 hover:bg-brand-500 shadow-sm'
              )}
            >
              {isComparing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <GitCompare size={14} />
                  Compare {selectedDocs.length} Protocol{selectedDocs.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active Comparison Result */}
        {activeComparison?.result && (
          <ComparisonResult comparison={activeComparison} documents={documents} />
        )}

        {/* Past Comparisons */}
        {comparisons.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Previous Comparisons</h3>
            <div className="space-y-2">
              {comparisons.map((cmp) => (
                <button
                  key={cmp.id}
                  onClick={() => loadComparison(cmp.id)}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 text-left hover:border-brand-200 hover:bg-brand-50/30 transition-colors group"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-700">
                      {cmp.document_ids?.length || 0} protocols compared
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        cmp.status === 'COMPLETE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      )}>
                        {cmp.status}
                      </span>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {cmp.created_at ? new Date(cmp.created_at).toLocaleString() : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonResult({ comparison, documents }) {
  const result = comparison.result || {};
  const dimensions = result.dimensions || [];
  const docMap = {};
  documents.forEach(d => { docMap[d.id] = d; });

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">Comparison Results</h3>
        {result.overall_winner && (
          <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
            Winner: {docMap[result.overall_winner]?.name || result.overall_winner}
          </span>
        )}
      </div>

      {result.summary && (
        <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed">{result.summary}</p>
      )}

      {/* Dimension Comparison Table */}
      {dimensions.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600">Dimension</th>
                {comparison.document_ids?.map(did => (
                  <th key={did} className="py-3 px-4 text-left text-xs font-semibold text-slate-600 truncate max-w-[150px]">
                    {docMap[did]?.name || did.slice(0, 8)}
                  </th>
                ))}
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-600">Winner</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dim, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 text-slate-800 font-medium text-xs">{dim.dimension}</td>
                  {comparison.document_ids?.map(did => (
                    <td key={did} className={cn(
                      'py-3 px-4 text-xs',
                      dim.winner === did ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                    )}>
                      {dim.values?.[did] || '—'}
                    </td>
                  ))}
                  <td className="py-3 px-4">
                    {dim.winner ? (
                      <span className="text-xs font-semibold text-emerald-700">
                        {docMap[dim.winner]?.name?.slice(0, 15) || '✓'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Tied</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
