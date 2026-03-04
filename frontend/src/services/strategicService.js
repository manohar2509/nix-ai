/**
 * NIX AI — Strategic Intelligence Service
 *
 * Frontend API client for the 8 killer features.
 * Uses the shared Axios instance from api.js (JWT-authenticated).
 */

import api from './api';

// ── 1. Adversarial Council (sync — legacy) ────────────────────
export const runCouncil = (docId) =>
  api.post(`/strategic/documents/${docId}/council`).then(r => r.data);

// ── 1b. Async Boardroom Debate (NEW — recommended) ───────────
export const startDebate = (docId, maxRounds = 3) =>
  api.post(`/strategic/documents/${docId}/debate`, { max_rounds: maxRounds }).then(r => r.data);

export const getDebateStatus = (debateId) =>
  api.get(`/strategic/debates/${debateId}`).then(r => r.data);

export const listDebates = (docId) =>
  api.get(`/strategic/documents/${docId}/debates`).then(r => r.data);

// ── 2. Friction Heatmap ───────────────────────────────────────
export const getFrictionMap = (docId) =>
  api.post(`/strategic/documents/${docId}/friction-map`).then(r => r.data);

// ── 3. Trial Cost Architect ───────────────────────────────────
export const getCostAnalysis = (docId) =>
  api.post(`/strategic/documents/${docId}/cost-analysis`).then(r => r.data);

// ── 4. Synthetic Payer Simulator ──────────────────────────────
export const simulatePayer = (docId) =>
  api.post(`/strategic/documents/${docId}/payer-simulation`).then(r => r.data);

// ── 5. Submission Strategy ────────────────────────────────────
export const getSubmissionStrategy = (docId) =>
  api.post(`/strategic/documents/${docId}/submission-strategy`).then(r => r.data);

// ── 6. Protocol Optimizer ─────────────────────────────────────
export const optimizeProtocol = (docId) =>
  api.post(`/strategic/documents/${docId}/optimize`).then(r => r.data);

// ── 7. Deal Room / Investor Report ────────────────────────────
export const getInvestorReport = (docId) =>
  api.post(`/strategic/documents/${docId}/investor-report`).then(r => r.data);

// ── 8. Compliance Watchdog ────────────────────────────────────
export const runWatchdog = (docId) =>
  api.post(`/strategic/documents/${docId}/watchdog`).then(r => r.data);

// ── Smart Clause Library ──────────────────────────────────────
export const getClauses = (docId) =>
  api.get(`/strategic/documents/${docId}/clauses`).then(r => r.data);

// ── Portfolio Risk ────────────────────────────────────────────
export const getPortfolioRisk = () =>
  api.get('/strategic/portfolio').then(r => r.data);

// ── Cross-Protocol Intelligence ───────────────────────────────
export const getCrossProtocol = () =>
  api.get('/strategic/cross-protocol').then(r => r.data);

export default {
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
};
