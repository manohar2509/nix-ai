import apiClient from './api';

/**
 * Document Service
 * 
 * Handles:
 * - Upload document (get presigned URL → upload to S3)
 * - List documents
 * - Get document details
 * - Delete document
 */

export const documentService = {
  /**
   * Request presigned URL for direct S3 upload
   * Backend: API Lambda - GET /upload-url
   */
  getPresignedUrl: async (filename, contentType = 'application/pdf') => {
    try {
      const res = await apiClient.get('/upload-url', {
        params: {
          filename,
          contentType,
        },
      });
      return res.data; // { url, key, expiration }
    } catch (error) {
      throw new Error('Unable to prepare file upload. Please try again.');
    }
  },

  /**
   * Upload file directly to S3 using presigned URL
   * This bypasses the backend for speed.
   * Returns { success, key, abort } where abort() cancels the upload.
   */
  uploadToS3: (file, presignedUrl, onProgress) => {
    let xhrRef = null;

    const promise = new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef = xhr;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentCompleted = Math.round(
            (event.loaded * 100) / event.total
          );
          onProgress?.(percentCompleted);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true, key: presignedUrl.split('?')[0] });
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
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });

    // Attach abort handle so callers can cancel
    promise.abort = () => xhrRef?.abort();
    return promise;
  },

  /**
   * Register uploaded document in metadata database
   * Backend: API Lambda - POST /documents
   */
  registerDocument: async (filename, s3Key, contentLength) => {
    try {
      const res = await apiClient.post('/documents', {
        name: filename,
        s3_key: s3Key,
        size: contentLength,
      });
      return res.data; // { id, name, createdAt, ... }
    } catch (error) {
      throw new Error('Unable to save document details. Please try again.');
    }
  },

  /**
   * List all documents for current user
   * Backend: API Lambda - GET /documents
   */
  listDocuments: async () => {
    try {
      const res = await apiClient.get('/documents');
      return res.data.documents; // Array of documents
    } catch (error) {
      throw new Error('Unable to load your documents. Please try refreshing the page.');
    }
  },

  /**
   * Get single document details + content
   * Backend: API Lambda - GET /documents/:id
   */
  getDocument: async (docId) => {
    try {
      const res = await apiClient.get(`/documents/${docId}`);
      return res.data; // { id, name, content, sections, ... }
    } catch (error) {
      throw new Error('Unable to load this document. Please try again.');
    }
  },

  /**
   * Delete document (hard delete from DynamoDB + S3)
   * Backend: API Lambda - DELETE /documents/:id
   */
  deleteDocument: async (docId) => {
    try {
      const res = await apiClient.delete(`/documents/${docId}`);
      return res.data; // { success: true }
    } catch (error) {
      throw new Error('Unable to remove this document. Please try again.');
    }
  },
};

export default documentService;
