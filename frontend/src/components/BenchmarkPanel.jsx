/**
 * BenchmarkPanel — REQ-10: ClinicalTrials.gov Benchmarking
 *
 * Benchmarks the current protocol against similar trials from
 * ClinicalTrials.gov, showing how it compares on key metrics.
 */

import { useState, useEffect } from 'react';
import { useAppStore, useRegulatory } from '../stores/useAppStore';
import { getBenchmark } from '../services/regulatoryService';
import { cn } from '../utils/cn';

const ASSESSMENT_STYLES = {
  above_average: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  typical: 'text-blue-700 bg-blue-50 border-blue-200',
  below_average: 'text-amber-700 bg-amber-50 border-amber-200',
};

const ASSESSMENT_EXPLANATIONS = {
  above_average: 'Your protocol exceeds the industry norm for this metric, which may strengthen your regulatory submission and investor confidence.',
  typical: 'Your protocol aligns with industry norms. This is generally acceptable to regulators and IRBs.',
  below_average: 'Your protocol falls below industry norms. Consider whether this is a deliberate design choice or a potential risk to study feasibility.',
};

const METRIC_EXPLANATIONS = {
  'Sample Size': 'Total number of participants planned. Underpowered studies risk inconclusive results; overpowered studies waste resources and expose more patients unnecessarily.',
  'Study Duration': 'Total expected duration from first patient enrolled to last patient last visit. Affects budget, site retention, and competitive landscape timing.',
  'Number of Arms': 'Treatment groups in the study. More arms increase complexity and enrollment requirements but provide richer comparative data.',
  'Primary Endpoint': 'The main outcome measure. Regulators evaluate if it is clinically meaningful, well-defined, and appropriately timed.',
  'Number of Sites': 'Planned investigational sites. Affects enrollment speed, data quality, geographic diversity, and operational complexity.',
  'Enrollment Duration': 'Time to enroll all participants. Slow enrollment is the #1 cause of clinical trial delays.',
};

export default function BenchmarkPanel({ docId }) {
  const { benchmark, isBenchmarking } = useRegulatory();
  const store = useAppStore();
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [error, setError] = useState(null);
  const [expandedMetric, setExpandedMetric] = useState(null);

  // Reset benchmark state when document changes
  useEffect(() => {
    store.setBenchmark(null);
    setIndication('');
    setPhase('');
    setError(null);
    setExpandedMetric(null);
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBenchmark = async () => {
    if (!docId) return;
    if (!indication.trim()) {
      setError('Please enter a therapeutic indication (e.g., "non-small cell lung cancer") to find relevant comparison trials.');
      return;
    }
    setError(null);
    store.setIsBenchmarking(true);

    try {
      const data = await getBenchmark(docId, indication, phase);
      store.setBenchmark(data);
    } catch (err) {
      setError(err.message || 'Benchmarking failed');
    } finally {
      store.setIsBenchmarking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Introduction */}
      <div className="p-3 rounded-xl bg-brand-50/60 border border-brand-100/60">
        <div className="text-[11px] font-semibold text-brand-700 mb-1">📊 Protocol Benchmarking</div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Compare your protocol's key design parameters against similar registered trials on ClinicalTrials.gov.
          This helps validate your study design, identify potential feasibility risks, and strengthen your regulatory and investor communications.
        </p>
      </div>

      {/* Search Inputs */}
      <div className="space-y-2">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
          Benchmark Against ClinicalTrials.gov
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={indication}
            onChange={(e) => setIndication(e.target.value)}
            placeholder="Therapeutic indication (e.g., non-small cell lung cancer)"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          />
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          >
            <option value="">Any Phase</option>
            <option value="1">Phase 1</option>
            <option value="2">Phase 2</option>
            <option value="3">Phase 3</option>
            <option value="4">Phase 4</option>
          </select>
        </div>
        <button
          onClick={handleBenchmark}
          disabled={isBenchmarking || !docId}
          className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-100 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isBenchmarking ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
              Benchmarking...
            </span>
          ) : (
            '📊 Run Benchmark'
          )}
        </button>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
      </div>

      {/* Benchmark Results */}
      {benchmark && (
        <div className="space-y-3">
          {benchmark.summary && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-700 mb-1">Summary</div>
              <p className="text-xs text-slate-600 leading-relaxed">{benchmark.summary}</p>
            </div>
          )}

          {/* Assessment legend */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-slate-600">Above Average</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[11px] text-slate-600">Typical</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[11px] text-slate-600">Below Average</span>
            </div>
          </div>

          {benchmark.benchmarks?.length > 0 && (
            <div className="space-y-2">
              {benchmark.benchmarks.map((b, i) => {
                const isExpanded = expandedMetric === i;
                const explanation = METRIC_EXPLANATIONS[b.metric] || '';
                const assessmentExpl = ASSESSMENT_EXPLANATIONS[b.assessment] || '';

                return (
                  <div
                    key={i}
                    className={cn(
                      'p-3 rounded-xl bg-white border space-y-1.5 shadow-sm cursor-pointer transition-all hover:shadow-md',
                      isExpanded ? 'border-brand-200 ring-1 ring-brand-100' : 'border-slate-200'
                    )}
                    onClick={() => setExpandedMetric(isExpanded ? null : i)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-800">{b.metric}</span>
                      <span className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded font-medium border',
                        ASSESSMENT_STYLES[b.assessment] || ASSESSMENT_STYLES.typical
                      )}>
                        {b.assessment?.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      <div>
                        <span className="text-slate-500">Your Protocol:</span>
                        <span className="text-slate-800 ml-1 font-semibold">{b.protocol_value || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Industry Median:</span>
                        <span className="text-slate-600 ml-1">{b.benchmark_median || '—'}</span>
                      </div>
                      {b.benchmark_range && (
                        <div>
                          <span className="text-slate-500">Range:</span>
                          <span className="text-slate-400 ml-1">{b.benchmark_range}</span>
                        </div>
                      )}
                    </div>

                    {/* Percentile Bar */}
                    {b.percentile != null && (
                      <div className="relative">
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all duration-500"
                            style={{ width: `${b.percentile}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[11px] text-slate-400">0th</span>
                          <span className="text-[11px] text-brand-600 font-semibold">{b.percentile}th percentile</span>
                          <span className="text-[11px] text-slate-400">100th</span>
                        </div>
                      </div>
                    )}

                    {/* Expanded explanation */}
                    {isExpanded && (
                      <div className="mt-1 pt-2 border-t border-slate-100 space-y-2 animate-fade-in">
                        {explanation && (
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                            <div className="text-[10px] text-slate-500 font-semibold mb-0.5">About This Metric</div>
                            <p className="text-[11px] text-slate-600 leading-relaxed">{explanation}</p>
                          </div>
                        )}
                        {assessmentExpl && (
                          <div className="p-2 rounded-lg bg-brand-50 border border-brand-100">
                            <div className="text-[10px] text-brand-600 font-semibold mb-0.5">💡 What This Means</div>
                            <p className="text-[11px] text-slate-700 leading-relaxed">{assessmentExpl}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
