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
      throw {
        message: 'Failed to get upload URL',
        details: error.message,
      };
    }
  },

  /**
   * Upload file directly to S3 using presigned URL
   * This bypasses the backend for speed
   */
  uploadToS3: async (file, presignedUrl, onProgress) => {
    try {
      // Use XMLHttpRequest for upload progress tracking
      // (fetch API does not support upload progress events)
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

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
            resolve();
          } else {
            reject(new Error(`S3 upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      return { success: true, key: presignedUrl.split('?')[0] };
    } catch (error) {
      throw {
        message: 'File upload failed',
        details: error.message,
      };
    }
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
      throw {
        message: 'Failed to register document',
        details: error.message,
      };
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
      throw {
        message: 'Failed to fetch documents',
        details: error.message,
      };
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
      throw {
        message: 'Failed to fetch document',
        details: error.message,
      };
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
      throw {
        message: 'Failed to delete document',
        details: error.message,
      };
    }
  },
};

export default documentService;
