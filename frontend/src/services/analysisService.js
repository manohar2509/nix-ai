import apiClient from './api';

/**
 * Analysis Service
 * 
 * Handles:
 * - Trigger document analysis (regulatory + cost)
 * - Poll analysis status
 * - Get analysis results (conflicts, findings, scores)
 */

export const analysisService = {
  /**
   * Trigger analysis for a document
   * Backend: API Lambda - POST /analyze
   * 
   * This calls Worker Lambda via SQS, returns jobId immediately
   */
  /**
   * Load user preferences from localStorage
   */
  _getPreferences: () => {
    try {
      const stored = localStorage.getItem('nixai-user-preferences');
      if (!stored) return undefined;
      const prefs = JSON.parse(stored);
      return {
        risk_sensitivity: prefs.riskSensitivity || 'balanced',
        analysis_focus: prefs.analysisFocus || 'both',
        include_recommendations: prefs.includeRecommendations !== false,
        regulatory_threshold: prefs.regulatoryThreshold || 50,
        payer_threshold: prefs.payerThreshold || 50,
      };
    } catch {
      return undefined;
    }
  },

  triggerAnalysis: async (docId) => {
    try {
      const preferences = analysisService._getPreferences();
      const res = await apiClient.post('/analyze', {
        document_id: docId,
        ...(preferences ? { preferences } : {}),
      });
      return res.data; // { jobId, status: 'QUEUED' }
    } catch (error) {
      const status = error.status || error.response?.status;
      const message =
        status === 404 ? 'Document not found. Please upload and select a document first.'
        : status === 409 ? 'An analysis is already in progress for this document.'
        : status === 429 ? 'Too many analysis requests. Please wait a moment before trying again.'
        : 'Unable to start the analysis. Please try again.';
      const err = new Error(message);
      err.status = status;
      throw err;
    }
  },

  /**
   * Poll analysis status by jobId
   * Backend: API Lambda - GET /analyze/:jobId
   */
  getAnalysisStatus: async (jobId) => {
    try {
      const res = await apiClient.get(`/analyze/${jobId}`);
      return res.data; // { jobId, status, progress, result }
    } catch (error) {
      const status = error.status || error.response?.status;
      if (status === 404) {
        return { jobId, status: 'NOT_FOUND' };
      }
      const message =
        status === 503 ? 'Analysis service is temporarily unavailable. Retrying...'
        : 'Unable to check analysis progress. Please try again.';
      const err = new Error(message);
      err.status = status;
      throw err;
    }
  },

  /**
   * Get completed analysis results
   * Backend: API Lambda - GET /documents/:docId/analysis
   */
  getAnalysisResults: async (docId) => {
    try {
      const res = await apiClient.get(`/documents/${docId}/analysis`);
      return res.data; // { regulatorScore, payerScore, findings, ... }
    } catch (error) {
      const status = error.status || error.response?.status;
      const message =
        status === 404 ? 'No analysis found. Please analyze this document first.'
        : 'Unable to load analysis results. Please try again.';
      const err = new Error(message);
      err.status = status;
      throw err;
    }
  },

  /**
   * Retry analysis if it failed
   * Backend: API Lambda - POST /analyze/:jobId/retry
   */
  retryAnalysis: async (jobId) => {
    try {
      const res = await apiClient.post(`/analyze/${jobId}/retry`);
      return res.data; // New jobId
    } catch (error) {
      const status = error.status || error.response?.status;
      const message =
        status === 404 ? 'Original analysis not found. Please start a new analysis instead.'
        : status === 429 ? 'Too many retry requests. Please wait a moment.'
        : 'Unable to retry the analysis. Please try again.';
      const err = new Error(message);
      err.status = status;
      throw err;
    }
  },
};

export default analysisService;
