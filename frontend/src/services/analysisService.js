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
  triggerAnalysis: async (docId) => {
    try {
      const res = await apiClient.post('/analyze', {
        document_id: docId,
      });
      return res.data; // { jobId, status: 'QUEUED' }
    } catch (error) {
      throw {
        message: 'Failed to start analysis',
        details: error.message,
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
        message: 'Failed to fetch analysis status',
        details: error.message,
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
        message: 'Failed to fetch analysis results',
        details: error.message,
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
        message: 'Failed to retry analysis',
        details: error.message,
      };
    }
  },
};

export default analysisService;
