/**
 * AmendmentSimulator — REQ-3: Protocol Amendment Impact Simulator
 *
 * What-if analysis tool that lets users describe a proposed amendment
 * and see the projected impact on regulatory/payer scores.
 */

import { useState, useEffect, useRef } from 'react';
import { useAppStore, useRegulatory } from '../stores/useAppStore';
import { triggerSimulation, listSimulations } from '../services/regulatoryService';
import { analysisService } from '../services/analysisService';

const IMPACT_COLORS = {
  improved: 'text-emerald-600',
  degraded: 'text-red-600',
  neutral: 'text-slate-500',
};

const ARROW = {
  improved: '↑',
  degraded: '↓',
  neutral: '→',
};

export default function AmendmentSimulator({ docId }) {
  const { simulations, isSimulating } = useRegulatory();
  const store = useAppStore();
  const [amendmentText, setAmendmentText] = useState('');
  const [error, setError] = useState(null);
  const pollIntervalRef = useRef(null);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Load existing simulations when component mounts or document changes
  useEffect(() => {
    if (!docId) return;
    store.setSimulations([]);
    const load = async () => {
      try {
        const data = await listSimulations(docId);
        store.setSimulations(data.simulations || []);
      } catch {
        // No simulations yet — that's fine
      }
    };
    load();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSimulate = async () => {
    if (!docId || !amendmentText.trim()) return;
    setError(null);
    store.setIsSimulating(true);

    try {
      const result = await triggerSimulation(docId, amendmentText);

      // If inline (local dev), result is immediate
      if (result.inline || result.status === 'COMPLETE') {
        await refreshSimulations();
      } else {
        // Poll for completion
        const jobId = result.jobId;
        pollIntervalRef.current = setInterval(async () => {
          try {
            const status = await analysisService.getAnalysisStatus(jobId);
            if (status.status === 'COMPLETE' || status.status === 'FAILED') {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              await refreshSimulations();
            }
          } catch {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }, 2000);
      }

      setAmendmentText('');
    } catch (err) {
      setError('The simulation could not be completed. Please try again.');
    } finally {
      store.setIsSimulating(false);
    }
  };

  const refreshSimulations = async () => {
    try {
      const data = await listSimulations(docId);
      store.setSimulations(data.simulations || []);
    } catch (err) {
      console.error('Failed to refresh simulations:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Input Area */}
      <div className="space-y-2">
        <label className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
          Describe Proposed Protocol Amendment
        </label>
        <textarea
          value={amendmentText}
          onChange={(e) => setAmendmentText(e.target.value)}
          placeholder="Describe the change you want to evaluate, e.g.:
• Add a second interim analysis at 60% enrollment with futility stopping boundary
• Change primary endpoint from PFS to OS
• Expand eligibility criteria to include patients with prior immunotherapy
• Add an Eastern European clinical site for faster enrollment"
          className="w-full h-24 bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          maxLength={5000}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">{amendmentText.length}/5000</span>
          <button
            onClick={handleSimulate}
            disabled={isSimulating || !amendmentText.trim() || amendmentText.length < 10}
            className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-100 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isSimulating ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                Simulating...
              </span>
            ) : (
              '⚡ Simulate Amendment Impact'
            )}
          </button>
        </div>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
      </div>

      {/* Simulation Results */}
      {simulations.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
            Simulation History ({simulations.length})
          </div>
          {simulations.map((sim) => (
            <SimulationCard key={sim.id} simulation={sim} />
          ))}
        </div>
      )}
    </div>
  );
}

function SimulationCard({ simulation }) {
  const [expanded, setExpanded] = useState(false);
  const result = simulation.result || {};
  const regDelta = result.regulator_delta || {};
  const payDelta = result.payer_delta || {};

  return (
    <div
      className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-slate-300 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600 truncate flex-1 mr-2">
          "{simulation.amendment_text?.slice(0, 80)}..."
        </div>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          simulation.status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700' :
          simulation.status === 'FAILED' ? 'bg-red-50 text-red-700' :
          'bg-amber-50 text-amber-700'
        }`}>
          {simulation.status}
        </span>
      </div>

      {/* Score Deltas */}
      {simulation.status === 'COMPLETE' && result.regulator_delta && (
        <div className="flex gap-4 mt-2">
          <ScoreDelta label="Regulator" delta={regDelta} />
          <ScoreDelta label="Payer" delta={payDelta} />
          <div className="flex-1 text-right">
            <span className={`text-sm font-medium ${IMPACT_COLORS[result.net_risk_change] || 'text-slate-500'}`}>
              {ARROW[result.net_risk_change]} {result.net_risk_change}
            </span>
          </div>
        </div>
      )}

      {/* Expanded Detail */}
      {expanded && simulation.status === 'COMPLETE' && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 animate-in slide-in-from-top-1">
          {result.summary && (
            <p className="text-xs text-slate-600">{result.summary}</p>
          )}

          {result.jurisdiction_impacts?.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Jurisdiction Impacts:</div>
              <div className="flex flex-wrap gap-1">
                {result.jurisdiction_impacts.map((ji, i) => (
                  <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded ${
                    ji.impact === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                    ji.impact === 'negative' ? 'bg-red-50 text-red-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {ji.jurisdiction}: {ji.impact}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.resolved_findings?.length > 0 && (
            <div className="text-xs text-emerald-600">
              ✅ Resolves {result.resolved_findings.length} finding(s)
            </div>
          )}

          {result.new_findings?.length > 0 && (
            <div className="text-xs text-amber-600">
              ⚠️ Introduces {result.new_findings.length} new finding(s)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreDelta({ label, delta }) {
  const direction = delta.direction || 'neutral';
  return (
    <div className="flex-1">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-500">{delta.before || 0}%</span>
        <span className={`text-xs font-medium ${IMPACT_COLORS[direction]}`}>
          {ARROW[direction]} {delta.after || 0}%
        </span>
        <span className={`text-[11px] ${IMPACT_COLORS[direction]}`}>
          ({delta.delta > 0 ? '+' : ''}{delta.delta || 0})
        </span>
      </div>
    </div>
  );
}
