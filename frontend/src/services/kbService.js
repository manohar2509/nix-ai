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
      throw new Error('Unable to prepare the upload. Please try again.');
    }
  },

  /**
   * Upload file directly to the KB S3 bucket using presigned URL.
   * Supports progress tracking via XMLHttpRequest.
   * Returns a promise with an .abort() method for cancellation.
   */
  uploadToKBBucket: (file, presignedUrl, onProgress) => {
    let xhrRef = null;

    const promise = new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef = xhr;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded * 100) / event.total);
          onProgress?.(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true });
        } else {
          reject(new Error('File upload could not be completed. Please try again.'));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload interrupted — please check your internet connection and try again.'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');
      xhr.send(file);
    });

    promise.abort = () => xhrRef?.abort();
    return promise;
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
      throw new Error('Unable to register the document. Please try again.');
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
      throw new Error('Unable to load knowledge base documents. Please try again.');
    }
  },

  /**
   * Delete a KB document (removes from DynamoDB + KB S3 bucket).
    * Deletion now also queues Bedrock reconciliation automatically.
   */
  deleteDocument: async (kbDocId) => {
    try {
      const res = await apiClient.delete(`/kb/documents/${kbDocId}`);
      return res.data; // { success: true, id }
    } catch (error) {
      throw new Error('Unable to delete the document. Please try again.');
    }
  },

  /**
   * Trigger Bedrock KB sync (re-index all documents in KB bucket).
   * Should be called after uploading or deleting KB documents.
   */
  syncKnowledgeBase: async (options = {}) => {
    try {
      const params = {};
      if (options.category) params.category = options.category;
      if (options.onlyChanged) params.onlyChanged = true;
      const res = await apiClient.post('/kb/sync', null, { params });
      return res.data; // { jobId, status, createdAt, deduplicated?, inline? }
    } catch (error) {
      throw new Error('Unable to start knowledge base sync. Please try again.');
    }
  },

  /**
   * Get KB statistics (document count, categories, etc.).
   */
  getStats: async () => {
    try {
      const res = await apiClient.get('/kb/stats');
      return res.data; // { total_documents, total_size, categories, synced_count, unsynced_count, ... }
    } catch (error) {
      throw new Error('Unable to load knowledge base statistics. Please try again.');
    }
  },

  /**
   * Check if a filename is a duplicate in the KB.
   */
  checkDuplicate: async (filename) => {
    try {
      const res = await apiClient.get('/kb/duplicate-check', {
        params: { filename },
      });
      return res.data; // { is_duplicate, existing_document, message }
    } catch (error) {
      throw new Error('Unable to check for duplicates. Please try again.');
    }
  },

  /**
   * Run comprehensive sanity checks on the entire KB.
   */
  runSanityCheck: async () => {
    try {
      const res = await apiClient.get('/kb/sanity-check');
      return res.data;
    } catch (error) {
      throw new Error('Unable to run the verification check. Please try again.');
    }
  },

  /**
   * Unsync a KB document — exclude it from next Bedrock re-index.
   */
  unsyncDocument: async (kbDocId) => {
    try {
      const res = await apiClient.post(`/kb/documents/${kbDocId}/unsync`);
      return res.data;
    } catch (error) {
      throw new Error('Unable to unsync the document. Please try again.');
    }
  },

  /**
   * Re-sync a previously unsynced KB document.
   */
  resyncDocument: async (kbDocId) => {
    try {
      const res = await apiClient.post(`/kb/documents/${kbDocId}/resync`);
      return res.data;
    } catch (error) {
      throw new Error('Unable to resync the document. Please try again.');
    }
  },

  /**
   * Bulk delete multiple KB documents.
   */
  bulkDelete: async (documentIds) => {
    try {
      const res = await apiClient.post('/kb/bulk-delete', {
        document_ids: documentIds,
      });
      return res.data;
    } catch (error) {
      throw new Error('Unable to delete the selected documents. Please try again.');
    }
  },

  /**
   * Update KB metadata fields (name / description / category).
   */
  updateDocument: async (kbDocId, updates) => {
    try {
      const res = await apiClient.put(`/kb/documents/${kbDocId}`, updates);
      return res.data;
    } catch (error) {
      throw new Error('Unable to update the document. Please try again.');
    }
  },

  /**
   * Replace KB document source file after new file was uploaded to S3.
   */
  replaceDocument: async (kbDocId, payload) => {
    try {
      const res = await apiClient.post(`/kb/documents/${kbDocId}/replace`, payload);
      return res.data;
    } catch (error) {
      throw new Error('Unable to replace the document file. Please try again.');
    }
  },

  /**
   * Retrieve immutable audit history for one KB document.
   */
  getDocumentHistory: async (kbDocId, limit = 100) => {
    try {
      const res = await apiClient.get(`/kb/documents/${kbDocId}/history`, {
        params: { limit },
      });
      return res.data;
    } catch (error) {
      throw new Error('Unable to load document history. Please try again.');
    }
  },

  /**
   * List tracked ingestion jobs for sync observability.
   */
  listIngestions: async (syncJobId = null) => {
    try {
      const params = {};
      if (syncJobId) params.syncJobId = syncJobId;
      const res = await apiClient.get('/kb/ingestions', { params });
      return res.data;
    } catch (error) {
      throw new Error('Unable to load sync details. Please try again.');
    }
  },

  /**
   * Reconcile S3 bucket with DynamoDB — import any unregistered files.
   * Scans the KB bucket for files that exist in S3 but have no metadata record.
   */
  reconcileDocuments: async () => {
    try {
      const res = await apiClient.post('/kb/reconcile');
      return res.data;
    } catch (error) {
      throw new Error('Unable to reconcile documents. Please try again.');
    }
  },
};

export default kbService;
