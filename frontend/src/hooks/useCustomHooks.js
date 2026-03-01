import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';

/**
 * Custom Hooks for NIX AI
 * Encapsulates common patterns and reusable logic
 */

/**
 * Hook: useJobPolling
 * Auto-polls a job status with exponential backoff
 * Stops when status changes to COMPLETE or FAILED
 */
export function useJobPolling(jobId, onComplete, onFailed, interval = 2000) {
  const updateActiveJob = useAppStore((state) => state.updateActiveJob);
  const moveJobToCompleted = useAppStore((state) => state.moveJobToCompleted);
  const moveJobToFailed = useAppStore((state) => state.moveJobToFailed);
  const intervalRef = useRef(null);
  const isPollingRef = useRef(false);

  const startPolling = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    const { jobService } = await import('../services/jobService');

    const poll = async () => {
      try {
        const status = await jobService.getJobStatus(jobId);

        if (status.status === 'COMPLETE') {
          isPollingRef.current = false;
          moveJobToCompleted(jobId);
          onComplete?.(status);
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (status.status === 'FAILED') {
          isPollingRef.current = false;
          moveJobToFailed(jobId, status.error);
          onFailed?.(status);
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else {
          // Update progress
          updateActiveJob(jobId, {
            status: status.status,
            progress: status.progress,
            currentStep: status.currentStep,
            estimatedTimeRemaining: status.estimatedTimeRemaining,
          });
        }
      } catch (error) {
        console.error('Job polling error:', error);
      }
    };

    // Initial poll
    await poll();

    // Set up interval
    intervalRef.current = setInterval(poll, interval);
  }, [jobId, updateActiveJob, moveJobToCompleted, moveJobToFailed, onComplete, onFailed, interval]);

  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { startPolling, stopPolling };
}

/**
 * Hook: useDocumentUpload
 * Handles file selection, validation, and upload to S3
 */
export function useDocumentUpload() {
  const showToast = useAppStore((state) => state.showToast);
  const addDocument = useAppStore((state) => state.addDocument);
  const setCurrentDocument = useAppStore((state) => state.setCurrentDocument);

  const uploadDocument = useCallback(async (file) => {
    const { documentService } = await import('../services/documentService');

    try {
      if (!file.type.includes('pdf')) {
        throw new Error('Only PDF files are supported');
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('File size must be less than 50MB');
      }

      // Get presigned URL
      const { url, key } = await documentService.getPresignedUrl(
        file.name,
        file.type
      );

      // Upload to S3
      await documentService.uploadToS3(file, url);

      // Register document
      const doc = await documentService.registerDocument(
        file.name,
        key,
        file.size
      );

      // Update store
      addDocument(doc);
      setCurrentDocument(doc);

      showToast({
        type: 'success',
        title: 'Upload successful',
        message: `${file.name} ready for analysis`,
      });

      return doc;
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Upload failed',
        message: error.message,
      });
      throw error;
    }
  }, [addDocument, setCurrentDocument, showToast]);

  return { uploadDocument };
}

/**
 * Hook: useAnalysisFlow
 * Triggers analysis and polls until complete
 */
export function useAnalysisFlow(docId) {
  const setIsAnalyzing = useAppStore((state) => state.setIsAnalyzing);
  const setLastAnalysis = useAppStore((state) => state.setLastAnalysis);
  const showToast = useAppStore((state) => state.showToast);

  const startAnalysis = useCallback(async () => {
    const { analysisService } = await import('../services/analysisService');

    try {
      setIsAnalyzing(true);

      // Trigger analysis
      const response = await analysisService.triggerAnalysis(docId);
      const jobId = response.jobId;

      // ── Case: Inline execution (local dev — already finished) ──
      if (response.inline) {
        if (response.status === 'FAILED') throw new Error(response.error || 'Analysis failed');
        const results = await analysisService.getAnalysisResults(docId);
        setLastAnalysis(results);
        showToast({ type: 'success', title: 'Analysis complete', message: 'Conflict detection finished' });
        return results;
      }

      // ── Case: SQS-queued (production) — poll with backoff ──
      const delays = [2000, 2000, 3000, 3000, 5000, 5000, 5000, 8000, 8000, 10000]; // ~51s total
      let status = response.status;
      for (const delay of delays) {
        if (status !== 'QUEUED' && status !== 'IN_PROGRESS') break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        const result = await analysisService.getAnalysisStatus(jobId);
        status = result.status;
      }

      if (status === 'FAILED') {
        throw new Error('Analysis failed');
      }
      if (status !== 'COMPLETE') {
        showToast({ type: 'info', title: 'Analysis still processing', message: 'Running in the background. Check back shortly.' });
        return null;
      }

      // Get results
      const results = await analysisService.getAnalysisResults(docId);
      setLastAnalysis(results);

      showToast({
        type: 'success',
        title: 'Analysis complete',
        message: 'Conflict detection finished',
      });

      return results;
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Analysis failed',
        message: error.message,
      });
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }, [docId, setIsAnalyzing, setLastAnalysis, showToast]);

  return { startAnalysis };
}

/**
 * Hook: useChatMessaging
 * Sends messages to AI and manages conversation history
 */
export function useChatMessaging(docId) {
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const setIsChatLoading = useAppStore((state) => state.setIsChatLoading);
  const setChatError = useAppStore((state) => state.setChatError);
  const showToast = useAppStore((state) => state.showToast);

  const sendMessage = useCallback(
    async (text) => {
      const { chatService } = await import('../services/chatService');

      try {
        setIsChatLoading(true);
        setChatError(null);

        // Add user message optimistically
        const userMessage = {
          id: `msg-${Date.now()}`,
          role: 'user',
          text,
          time: 'Just now',
        };
        addChatMessage(userMessage);

        // Get AI response
        const aiMessage = await chatService.sendMessage(docId, text);

        // Add AI message
        addChatMessage({
          id: `msg-${Date.now() + 1}`,
          role: 'ai',
          text: aiMessage.text,
          citations: aiMessage.citations,
          time: 'Just now',
        });

        return aiMessage;
      } catch (error) {
        setChatError(error.message);
        showToast({
          type: 'error',
          title: 'Message failed',
          message: error.message,
        });
        throw error;
      } finally {
        setIsChatLoading(false);
      }
    },
    [docId, addChatMessage, setIsChatLoading, setChatError, showToast]
  );

  return { sendMessage };
}

/**
 * Hook: useLocalStorage
 * Persist and hydrate state from localStorage
 */
export function useLocalStorage(key, initialValue) {
  const getStoredValue = useCallback(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  }, [key, initialValue]);

  const setValue = useCallback(
    (value) => {
      try {
        const valueToStore =
          value instanceof Function ? value(getStoredValue()) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error('Error writing to localStorage:', error);
      }
    },
    [key, getStoredValue]
  );

  return [getStoredValue(), setValue];
}

/**
 * Hook: useAsync
 * Handle async operations with loading/error states
 */
export function useAsync(asyncFunction, immediate = true) {
  const [status, setStatus] = useState('idle');
  const [value, setValue] = useState(null);
  const [error, setError] = useState(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setValue(null);
    setError(null);

    try {
      const response = await asyncFunction();
      setValue(response);
      setStatus('success');
      return response;
    } catch (error) {
      setError(error);
      setStatus('error');
      throw error;
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { execute, status, value, error };
}

/**
 * Hook: useDebounce
 * Debounce a value (for search, auto-save, etc.)
 */
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay, setDebouncedValue]);

  return debouncedValue;
}

/**
 * Hook: useClickOutside
 * Detect clicks outside a ref element
 */
export function useClickOutside(ref, callback) {
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, callback]);
}

/**
 * Hook: usePrevious
 * Track previous value
 */
export function usePrevious(value) {
  const ref = useRef();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
