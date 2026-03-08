import apiClient from './api';

/**
 * Analytics Service
 *
 * Handles:
 * - User dashboard (enhanced: scores, risk, chat usage, trends)
 * - Analysis history
 * - Admin platform analytics (all users, all data)
 * - Admin RAG & KB performance metrics
 */

export const analyticsService = {
  // ── User Analytics ──────────────────────────────────────────────

  /**
   * Get enhanced user dashboard analytics
   * Backend: GET /analytics/dashboard
   */
  getDashboard: async () => {
    try {
      const res = await apiClient.get('/analytics/dashboard');
      return res.data;
    } catch (error) {
      throw {
        message: 'Unable to load dashboard data. Please try refreshing.',
      };
    }
  },

  /**
   * Get full analysis history
   * Backend: GET /analytics/history
   */
  getAnalysisHistory: async () => {
    try {
      const res = await apiClient.get('/analytics/history');
      return res.data;
    } catch (error) {
      throw {
        message: 'Unable to load analysis history. Please try refreshing.',
      };
    }
  },

  // ── Admin Analytics ─────────────────────────────────────────────

  /**
   * Get platform-wide analytics (admin only)
   * Backend: GET /analytics/admin/platform
   */
  getAdminPlatform: async () => {
    try {
      const res = await apiClient.get('/analytics/admin/platform');
      return res.data;
    } catch (error) {
      throw {
        message: 'Unable to load platform analytics. Please try refreshing.',
      };
    }
  },

  /**
   * Get RAG & KB performance analytics (admin only)
   * Backend: GET /analytics/admin/rag
   */
  getAdminRAG: async () => {
    try {
      const res = await apiClient.get('/analytics/admin/rag');
      return res.data;
    } catch (error) {
      throw {
        message: 'Unable to load knowledge base analytics. Please try refreshing.',
      };
    }
  },
};

export default analyticsService;
