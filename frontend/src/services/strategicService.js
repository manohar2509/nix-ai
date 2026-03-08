/**
 * NIX AI — Strategic Intelligence Service
 *
 * Frontend API client for the 8 killer features.
 * Uses the shared Axios instance from api.js (JWT-authenticated).
 *
 * Resilience features:
 * - Automatic retry with exponential backoff (via api.js interceptor)
 * - Graceful error wrapping for UI consumption
 * - Timeout handling for long-running LLM calls
 */

import api from './api';

/**
 * Wrap API calls with standardized error handling.
 * Returns { data, error } instead of throwing.
 */
async function resilientCall(apiCall, featureName) {
  try {
    const result = await apiCall();
    return { data: result, error: null };
  } catch (err) {
    const errorMessage = err.userMessage || 'Something went wrong. Please try again.';
    console.error(`[Strategic] ${featureName} error:`, {
      status: err.status,
      errorCode: err.errorCode,
      retryable: err.retryable,
      requestId: err.requestId,
      message: errorMessage,
    });
    return {
      data: null,
      error: {
        message: errorMessage,
        status: err.status,
        retryable: err.retryable || false,
        errorCode: err.errorCode,
      },
    };
  }
}

// ── Cached Results (all features for a document) ──────────────
export const getCachedResults = (docId) =>
  api.get(`/strategic/documents/${docId}/cached`).then(r => r.data);

// ── 1. Adversarial Council (sync — legacy) ────────────────────
export const runCouncil = (docId) =>
  api.post(`/strategic/documents/${docId}/council`, null, { timeout: 120000 }).then(r => r.data);

// ── 1b. Async Boardroom Debate (NEW — recommended) ───────────
export const startDebate = (docId, maxRounds = 3) =>
  api.post(`/strategic/documents/${docId}/debate`, { max_rounds: maxRounds }).then(r => r.data);

export const getDebateStatus = (debateId) =>
  api.get(`/strategic/debates/${debateId}`).then(r => r.data);

export const listDebates = (docId) =>
  api.get(`/strategic/documents/${docId}/debates`).then(r => r.data);

// ── 2. Friction Heatmap ───────────────────────────────────────
export const getFrictionMap = (docId) =>
  api.post(`/strategic/documents/${docId}/friction-map`, null, { timeout: 90000 }).then(r => r.data);

// ── 3. Trial Cost Architect ───────────────────────────────────
export const getCostAnalysis = (docId) =>
  api.post(`/strategic/documents/${docId}/cost-analysis`, null, { timeout: 90000 }).then(r => r.data);

// ── 4. Synthetic Payer Simulator ──────────────────────────────
export const simulatePayer = (docId) =>
  api.post(`/strategic/documents/${docId}/payer-simulation`, null, { timeout: 90000 }).then(r => r.data);

// ── 5. Submission Strategy ────────────────────────────────────
export const getSubmissionStrategy = (docId) =>
  api.post(`/strategic/documents/${docId}/submission-strategy`, null, { timeout: 90000 }).then(r => r.data);

// ── 6. Protocol Optimizer ─────────────────────────────────────
export const optimizeProtocol = (docId) =>
  api.post(`/strategic/documents/${docId}/optimize`, null, { timeout: 90000 }).then(r => r.data);

// ── 7. Deal Room / Investor Report ────────────────────────────
export const getInvestorReport = (docId) =>
  api.post(`/strategic/documents/${docId}/investor-report`, null, { timeout: 90000 }).then(r => r.data);

// ── 8. Compliance Watchdog ────────────────────────────────────
export const runWatchdog = (docId) =>
  api.post(`/strategic/documents/${docId}/watchdog`, null, { timeout: 90000 }).then(r => r.data);

// ── Smart Clause Library ──────────────────────────────────────
export const getClauses = (docId) =>
  api.get(`/strategic/documents/${docId}/clauses`).then(r => r.data);

// ── Portfolio Risk ────────────────────────────────────────────
export const getPortfolioRisk = () =>
  api.get('/strategic/portfolio').then(r => r.data);

// ── Cross-Protocol Intelligence ───────────────────────────────
export const getCrossProtocol = () =>
  api.get('/strategic/cross-protocol').then(r => r.data);

// ── Resilient wrappers (for components that prefer { data, error }) ──
export const safeRunCouncil = (docId) => resilientCall(() => runCouncil(docId), 'Adversarial Council');
export const safeGetFrictionMap = (docId) => resilientCall(() => getFrictionMap(docId), 'Friction Heatmap');
export const safeGetCostAnalysis = (docId) => resilientCall(() => getCostAnalysis(docId), 'Cost Analysis');
export const safeSimulatePayer = (docId) => resilientCall(() => simulatePayer(docId), 'Payer Simulation');
export const safeGetSubmissionStrategy = (docId) => resilientCall(() => getSubmissionStrategy(docId), 'Submission Strategy');
export const safeOptimizeProtocol = (docId) => resilientCall(() => optimizeProtocol(docId), 'Protocol Optimizer');
export const safeGetInvestorReport = (docId) => resilientCall(() => getInvestorReport(docId), 'Investor Report');
export const safeRunWatchdog = (docId) => resilientCall(() => runWatchdog(docId), 'Compliance Watchdog');

export default {
  getCachedResults,
  runCouncil,
  startDebate,
  getDebateStatus,
  listDebates,
  getFrictionMap,
  getCostAnalysis,
  simulatePayer,
  getSubmissionStrategy,
  optimizeProtocol,
  getInvestorReport,
  runWatchdog,
  getClauses,
  getPortfolioRisk,
  getCrossProtocol,
  // Safe (non-throwing) wrappers
  safeRunCouncil,
  safeGetFrictionMap,
  safeGetCostAnalysis,
  safeSimulatePayer,
  safeGetSubmissionStrategy,
  safeOptimizeProtocol,
  safeGetInvestorReport,
  safeRunWatchdog,
};
