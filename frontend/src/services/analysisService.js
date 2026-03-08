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
      throw {
        message: 'Unable to start the analysis. Please try again.',
      };
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
      throw {
        message: 'Unable to check analysis progress. Please try again.',
      };
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
      throw {
        message: 'Unable to load analysis results. Please try again.',
      };
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
      throw {
        message: 'Unable to retry the analysis. Please try again.',
      };
    }
  },
};

export default analysisService;
