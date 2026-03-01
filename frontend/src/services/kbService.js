import apiClient from './api';

/**
 * Knowledge Base Service (Admin Only)
 *
 * Manages the curated Knowledge Base — reference documents that are
 * indexed by Bedrock and searchable by ALL users via RAG chat.
 *
 * ARCHITECTURE:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   KB docs   → nixai-clinical-kb bucket    → Bedrock RAG (shared)
 *   User docs → nixai-clinical-uploads bucket → PRIVATE (per-user)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Endpoints (all admin-only):
 *   GET    /kb/upload-url           → presigned URL for KB bucket
 *   POST   /kb/documents            → register KB document
 *   GET    /kb/documents            → list KB documents
 *   DELETE /kb/documents/:id        → delete KB document
 *   POST   /kb/sync                 → trigger Bedrock re-index
 *   GET    /kb/stats                → KB statistics
 */

export const kbService = {
  /**
   * Get presigned URL for uploading directly to the KB S3 bucket.
   * This URL points to nixai-clinical-kb/documents/ — NOT the user uploads bucket.
   */
  getUploadUrl: async (filename, contentType = 'application/pdf') => {
    try {
      const res = await apiClient.get('/kb/upload-url', {
        params: { filename, contentType },
      });
      return res.data; // { url, key, expiration }
    } catch (error) {
      throw {
        message: 'Failed to get KB upload URL',
        details: error.message,
      };
    }
  },

  /**
   * Upload file directly to the KB S3 bucket using presigned URL.
   * Supports progress tracking via XMLHttpRequest.
   */
  uploadToKBBucket: async (file, presignedUrl, onProgress) => {
    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded * 100) / event.total);
            onProgress?.(percent);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`KB upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during KB upload'));
        });

        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');
        xhr.send(file);
      });

      return { success: true };
    } catch (error) {
      throw {
        message: 'KB file upload failed',
        details: error.message,
      };
    }
  },

  /**
   * Register a KB document in the metadata database after upload.
   * Creates a KB_DOCUMENT entity (separate from user DOCUMENT entities).
   */
  registerDocument: async (name, s3Key, size, description = '', category = 'general') => {
    try {
      const res = await apiClient.post('/kb/documents', {
        name,
        s3_key: s3Key,
        size,
        description,
        category,
      });
      return res.data; // KBDocumentItem
    } catch (error) {
      throw {
        message: 'Failed to register KB document',
        details: error.message,
      };
    }
  },

  /**
   * List all KB documents (admin-curated reference materials).
   * Returns KB_DOCUMENT entities only — NOT user trial documents.
   */
  listDocuments: async () => {
    try {
      const res = await apiClient.get('/kb/documents');
      return res.data; // { documents: [...], total }
    } catch (error) {
      throw {
        message: 'Failed to fetch KB documents',
        details: error.message,
      };
    }
  },

  /**
   * Delete a KB document (removes from DynamoDB + KB S3 bucket).
   * After deletion, run Sync to remove from Bedrock's index.
   */
  deleteDocument: async (kbDocId) => {
    try {
      const res = await apiClient.delete(`/kb/documents/${kbDocId}`);
      return res.data; // { success: true, id }
    } catch (error) {
      throw {
        message: 'Failed to delete KB document',
        details: error.message,
      };
    }
  },

  /**
   * Trigger Bedrock KB sync (re-index all documents in KB bucket).
   * Should be called after uploading or deleting KB documents.
   */
  syncKnowledgeBase: async () => {
    try {
      const res = await apiClient.post('/kb/sync');
      return res.data; // { jobId, status, createdAt, deduplicated?, inline? }
    } catch (error) {
      throw {
        message: 'Failed to start KB sync',
        details: error.message,
      };
    }
  },

  /**
   * Get KB statistics (document count, categories, etc.).
   */
  getStats: async () => {
    try {
      const res = await apiClient.get('/kb/stats');
      return res.data; // { total_documents, total_size, categories }
    } catch (error) {
      throw {
        message: 'Failed to fetch KB stats',
        details: error.message,
      };
    }
  },
};

export default kbService;
