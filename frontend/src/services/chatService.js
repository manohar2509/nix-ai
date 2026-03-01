import apiClient from './api';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Chat Service
 * 
 * Handles:
 * - Send chat message with streaming (SSE)
 * - Send chat message (non-streaming fallback)
 * - Get chat history
 * - Get citations for a message
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const chatService = {
  /**
   * Send question to AI and stream the response via Server-Sent Events.
   * 
   * @param {string} docId - Document ID for context
   * @param {string} message - User's question
   * @param {object} callbacks - { onStart, onToken, onDone, onError }
   *   - onStart({ messageId, userMessageId })
   *   - onToken(textChunk)
   *   - onDone({ messageId, fullText, citations })
   *   - onError(errorMessage)
   * @returns {Promise<void>}
   */
  sendMessageStream: async (docId, message, { onStart, onToken, onDone, onError }) => {
    // Get the auth token (same as apiClient interceptor)
    let token = '';
    try {
      const session = await fetchAuthSession();
      token = session.tokens?.idToken?.toString() || '';
    } catch {
      // No session — proceed without token
    }

    try {
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          document_id: docId,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (each ends with \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.event) {
              case 'start':
                onStart?.(data);
                break;
              case 'token':
                onToken?.(data.text);
                break;
              case 'done':
                onDone?.(data);
                break;
              case 'error':
                onError?.(data.message || 'Unknown streaming error');
                break;
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (error) {
      onError?.(error.message || 'Failed to connect to streaming endpoint');
    }
  },

  /**
   * Send question to AI and get response with citations (non-streaming fallback)
   * Backend: API Lambda - POST /chat
   */
  sendMessage: async (docId, message) => {
    try {
      const res = await apiClient.post('/chat', {
        document_id: docId,
        message,
      });
      return res.data; // { id, text, citations, metadata }
    } catch (error) {
      throw {
        message: 'Failed to send message',
        details: error.message,
      };
    }
  },

  /**
   * Get all messages for a document (conversation history)
   * Backend: API Lambda - GET /documents/:docId/chat
   */
  getChatHistory: async (docId) => {
    try {
      const res = await apiClient.get(`/documents/${docId}/chat`);
      return res.data.messages; // Array of messages
    } catch (error) {
      throw {
        message: 'Failed to fetch chat history',
        details: error.message,
      };
    }
  },

  /**
   * Get detailed citations for a specific response
   * Backend: API Lambda - GET /chat/:messageId/citations
   */
  getMessageCitations: async (messageId) => {
    try {
      const res = await apiClient.get(`/chat/${messageId}/citations`);
      return res.data.citations; // Array of citations with sections
    } catch (error) {
      throw {
        message: 'Failed to fetch citations',
        details: error.message,
      };
    }
  },

  /**
   * Send feedback on AI response (thumbs up/down)
   * Used for model improvement and analytics
   * Backend: API Lambda - POST /chat/:messageId/feedback
   */
  submitFeedback: async (messageId, feedback) => {
    try {
      const res = await apiClient.post(`/chat/${messageId}/feedback`, {
        feedback, // 'positive' | 'negative'
      });
      return res.data;
    } catch (error) {
      throw {
        message: 'Failed to submit feedback',
        details: error.message,
      };
    }
  },

  /**
   * Clear chat history for a document
   * Backend: API Lambda - DELETE /documents/:docId/chat
   */
  clearChatHistory: async (docId) => {
    try {
      const res = await apiClient.delete(`/documents/${docId}/chat`);
      return res.data;
    } catch (error) {
      throw {
        message: 'Failed to clear chat history',
        details: error.message,
      };
    }
  },
};

export default chatService;
