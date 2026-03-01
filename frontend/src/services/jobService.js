import apiClient from './api';

/**
 * Job Service
 * 
 * Handles:
 * - Poll job status
 * - Download results
 * - Cancel / retry jobs
 * - KB sync
 */

export const jobService = {
  /**
   * Poll job status
   * Backend: API Lambda - GET /jobs/:jobId
   */
  getJobStatus: async (jobId) => {
    try {
      const res = await apiClient.get(`/jobs/${jobId}`);
      return res.data; 
      // {
      //   jobId,
      //   status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED',
      //   progress: { current: 12, total: 50, percent: 24 },
      //   currentStep: 'Generating cardiovascular risks...',
      //   estimatedTimeRemaining: 180, // seconds
      //   error?: 'timeout' | 'invalid_params' | ...
      // }
    } catch (error) {
      // Don't throw 404, just return not-found status
      if (error.status === 404) {
        return { jobId, status: 'NOT_FOUND' };
      }
      throw {
        message: 'Failed to fetch job status',
        details: error.message,
      };
    }
  },

  /**
   * Batch poll multiple jobs (more efficient than individual calls)
   * Backend: API Lambda - POST /jobs/batch-status
   */
  pollMultipleJobs: async (jobIds) => {
    try {
      const res = await apiClient.post('/jobs/batch-status', { jobIds });
      return res.data.jobs; // Array of job statuses
    } catch (error) {
      throw {
        message: 'Failed to fetch job statuses',
        details: error.message,
      };
    }
  },

  /**
   * Download job results (CSV, JSON, or Parquet)
   * Backend: API Lambda - GET /jobs/:jobId/download?format=csv
   */
  downloadJobResults: async (jobId, format = 'csv') => {
    try {
      const res = await apiClient.get(
        `/jobs/${jobId}/download?format=${format}`
      );

      const { url, filename } = res.data;

      if (!url) {
        throw new Error(res.data.error || 'No download URL available');
      }

      // Open presigned S3 URL to trigger browser download
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || `results-${jobId}.${format}`);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      return { success: true, filename: filename || `results-${jobId}.${format}` };
    } catch (error) {
      throw {
        message: 'Failed to download results',
        details: error.message,
      };
    }
  },

  /**
   * Get job metadata + statistics
   * Backend: API Lambda - GET /jobs/:jobId/stats
   */
  getJobStats: async (jobId) => {
    try {
      const res = await apiClient.get(`/jobs/${jobId}/stats`);
      return res.data; 
      // {
      //   jobId,
      //   totalRows: 50,
      //   fileSize: '2.3MB',
      //   generationTime: 245, // seconds
      //   costEstimate: '$0.42',
      //   ...
      // }
    } catch (error) {
      throw {
        message: 'Failed to fetch job stats',
        details: error.message,
      };
    }
  },

  /**
   * Cancel an in-progress job
   * Backend: API Lambda - POST /jobs/:jobId/cancel
   * 
   * Only works if status === 'IN_PROGRESS'
   */
  cancelJob: async (jobId) => {
    try {
      const res = await apiClient.post(`/jobs/${jobId}/cancel`);
      return res.data; // { success: true, jobId }
    } catch (error) {
      throw {
        message: 'Failed to cancel job',
        details: error.message,
      };
    }
  },

  /**
   * Retry a failed job with same parameters
   * Backend: API Lambda - POST /jobs/:jobId/retry
   */
  retryJob: async (jobId) => {
    try {
      const res = await apiClient.post(`/jobs/${jobId}/retry`);
      return res.data; // { newJobId, status: 'QUEUED' }
    } catch (error) {
      throw {
        message: 'Failed to retry job',
        details: error.message,
      };
    }
  },

  /**
   * List all jobs for current user
   * Backend: API Lambda - GET /jobs
   */
  listJobs: async (limit = 50) => {
    try {
      const res = await apiClient.get('/jobs', {
        params: { limit },
      });
      return res.data.jobs; // Array of jobs
    } catch (error) {
      throw {
        message: 'Failed to fetch jobs',
        details: error.message,
      };
    }
  },

  /**
   * Trigger Knowledge Base sync (Admin only)
   * @deprecated Use kbService.syncKnowledgeBase() instead — KB sync has moved to /kb/sync
   * This is kept for backward compatibility during transition.
   */
  submitKbSync: async () => {
    try {
      const res = await apiClient.post('/kb/sync');
      return res.data; // { jobId, status: 'QUEUED', createdAt }
    } catch (error) {
      throw {
        message: 'Failed to start KB sync',
        details: error.message,
      };
    }
  },
};

export default jobService;
