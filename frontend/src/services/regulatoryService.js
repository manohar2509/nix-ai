/**
 * NIX AI — Regulatory Intelligence Service
 *
 * Frontend API client for all REQ-1 through REQ-10 endpoints.
 * Uses the shared Axios instance from api.js (JWT-authenticated).
 */

import api from './api';

// ── REQ-1: ICH Guideline Database ─────────────────────────────
export const getGuidelines = () =>
  api.get('/regulatory/guidelines').then(r => r.data);

// ── REQ-2: Jurisdiction Compass ───────────────────────────────
export const getJurisdictionScores = (docId) =>
  api.get(`/regulatory/documents/${docId}/jurisdiction`).then(r => r.data);

// ── REQ-3: Amendment Simulation ───────────────────────────────
export const triggerSimulation = (docId, amendmentText) =>
  api.post(`/regulatory/documents/${docId}/simulate`, { amendment_text: amendmentText }).then(r => r.data);

export const listSimulations = (docId) =>
  api.get(`/regulatory/documents/${docId}/simulations`).then(r => r.data);

// ── REQ-4: Risk Timeline ─────────────────────────────────────
export const getTimeline = (docId) =>
  api.get(`/regulatory/documents/${docId}/timeline`).then(r => r.data);

// ── REQ-5: Payer Evidence Gaps ────────────────────────────────
export const getPayerGaps = (docId) =>
  api.get(`/regulatory/documents/${docId}/payer-gaps`).then(r => r.data);

// ── REQ-6: Protocol Comparison ────────────────────────────────
export const triggerComparison = (documentIds) =>
  api.post('/regulatory/compare', { document_ids: documentIds }).then(r => r.data);

export const listComparisons = () =>
  api.get('/regulatory/comparisons').then(r => r.data);

export const getComparison = (cmpId) =>
  api.get(`/regulatory/comparisons/${cmpId}`).then(r => r.data);

// ── REQ-8: Submission Readiness Report ────────────────────────
export const generateReport = (docId, format = 'json', sections = ['all']) =>
  api.post(`/regulatory/documents/${docId}/report`, { format, sections }).then(r => r.data);

// ── REQ-10: Benchmarking ──────────────────────────────────────
export const getBenchmark = (docId, indication = '', phase = '') =>
  api.get(`/regulatory/documents/${docId}/benchmark`, { params: { indication, phase } }).then(r => r.data);

export default {
  getGuidelines,
  getJurisdictionScores,
  triggerSimulation,
  listSimulations,
  getTimeline,
  getPayerGaps,
  triggerComparison,
  listComparisons,
  getComparison,
  generateReport,
  getBenchmark,
};
