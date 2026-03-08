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
        title: 'Upload unsuccessful',
        message: 'Something went wrong during the upload. Please try again.',
      });
      throw error;
    }
  }, [showToast, addDocument, setCurrentDocument]);

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
        if (response.status === 'FAILED') throw new Error('The analysis could not be completed. Please try again.');
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
        throw new Error('The analysis could not be completed. Please try again.');
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
        title: 'Analysis unsuccessful',
        message: 'The analysis could not be completed. Please try again.',
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
        setChatError('Unable to send your message. Please try again.');
        showToast({
          type: 'error',
          title: 'Unable to send',
          message: 'Something went wrong. Please try sending your message again.',
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
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error('Error writing to localStorage:', error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Hook: useAsync
 * Handle async operations with loading/error states.
 * Uses a ref for the async function to avoid infinite loops when
 * callers pass inline arrow functions.
 */
export function useAsync(asyncFunction, immediate = true) {
  const [status, setStatus] = useState('idle');
  const [value, setValue] = useState(null);
  const [error, setError] = useState(null);
  const asyncFnRef = useRef(asyncFunction);

  // Keep the ref up to date without triggering re-renders
  useEffect(() => {
    asyncFnRef.current = asyncFunction;
  }, [asyncFunction]);

  const execute = useCallback(async () => {
    setStatus('pending');
    setValue(null);
    setError(null);

    try {
      const response = await asyncFnRef.current();
      setValue(response);
      setStatus('success');
      return response;
    } catch (err) {
      setError(err);
      setStatus('error');
      throw err;
    }
  }, []);

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


/**
 * Hook: useStrategicCache
 *
 * Loads ALL cached strategic intelligence results for the current document
 * on mount (and when docId changes).  This means:
 *   - Page reloads restore previously generated AI panels
 *   - Switching documents instantly loads their cached results
 *   - No token waste for results that haven't changed
 *
 * The hook populates the Zustand store directly so every component
 * (CostArchitect, FrictionHeatmap, etc.) sees the data immediately.
 *
 * Timestamps are stored in Zustand (strategicTimestamps) so they
 * survive tab switches — unlike component-local useState which resets.
  *
 * Expert Panel Debate (Adversarial Council):
 *   A completed debate is saved as both a DEBATE entity AND a
 *   STRATEGIC_CACHE item (council_debate).  On reload, this hook
 *   restores debateStatus + activeDebateId so the panel shows the
 *   full transcript instead of the empty "Start Debate" state.
 */
export function useStrategicCache(docId) {
  const [loading, setLoading] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const prevDocIdRef = useRef(null);

  // Subscribe only to the specific setters we need — not the entire store.
  // This prevents re-renders on every unrelated store mutation.
  const setFrictionMap = useAppStore((s) => s.setFrictionMap);
  const setCostAnalysis = useAppStore((s) => s.setCostAnalysis);
  const setPayerSimulation = useAppStore((s) => s.setPayerSimulation);
  const setSubmissionStrategy = useAppStore((s) => s.setSubmissionStrategy);
  const setOptimization = useAppStore((s) => s.setOptimization);
  const setWatchdogAlerts = useAppStore((s) => s.setWatchdogAlerts);
  const setInvestorReport = useAppStore((s) => s.setInvestorReport);
  const setCouncilSession = useAppStore((s) => s.setCouncilSession);
  const setStrategicTimestamps = useAppStore((s) => s.setStrategicTimestamps);
  const setDebateStatus = useAppStore((s) => s.setDebateStatus);
  const setActiveDebateId = useAppStore((s) => s.setActiveDebateId);

  useEffect(() => {
    if (!docId) return;
    // If the document changed, reset the loaded flag and re-fetch
    if (docId !== prevDocIdRef.current) {
      setCacheLoaded(false);
      prevDocIdRef.current = docId;
    } else if (cacheLoaded) {
      // Same doc, already loaded — skip
      return;
    }

    let cancelled = false;

    const loadCache = async () => {
      setLoading(true);
      try {
        const { getCachedResults } = await import('../services/strategicService');
        const data = await getCachedResults(docId);
        if (cancelled) return;

        const cached = data?.cached || {};
        const timestamps = {};

        // Map cached results → Zustand store
        if (cached.friction_map) {
          setFrictionMap(cached.friction_map.result);
          timestamps.friction_map = cached.friction_map.generated_at;
        }
        if (cached.cost_analysis) {
          setCostAnalysis(cached.cost_analysis.result);
          timestamps.cost_analysis = cached.cost_analysis.generated_at;
        }
        if (cached.payer_simulation) {
          setPayerSimulation(cached.payer_simulation.result);
          timestamps.payer_simulation = cached.payer_simulation.generated_at;
        }
        if (cached.submission_strategy) {
          setSubmissionStrategy(cached.submission_strategy.result);
          timestamps.submission_strategy = cached.submission_strategy.generated_at;
        }
        if (cached.optimization) {
          setOptimization(cached.optimization.result);
          timestamps.optimization = cached.optimization.generated_at;
        }
        if (cached.watchdog) {
          setWatchdogAlerts(cached.watchdog.result);
          timestamps.watchdog = cached.watchdog.generated_at;
        }
        if (cached.investor_report) {
          setInvestorReport(cached.investor_report.result);
          timestamps.investor_report = cached.investor_report.generated_at;
        }
        if (cached.council) {
          setCouncilSession(cached.council.result);
          timestamps.council = cached.council.generated_at;
        }

        // Restore completed Expert Panel debate transcript on page reload.
        // council_debate contains the full async debate result (transcript + verdict).
        // We restore it into debateStatus so the component shows the completed
        // session instead of the empty "Start Debate" state.
        if (cached.council_debate) {
          const debateResult = cached.council_debate.result || {};
          const debateId = debateResult.debate_id;

          // Build a DebateStatusResponse-shaped object from the cached result
          const restoredStatus = {
            status: 'COMPLETED',
            progress: 100,
            protocol_name: debateResult.protocol_name || '',
            scores: debateResult.scores || {},
            current_round: debateResult.rounds_completed || 0,
            total_rounds: debateResult.rounds_completed || 0,
            current_topic: '',
            transcript: debateResult.transcript || [],
            final_verdict: debateResult.final_verdict || null,
            total_turns: debateResult.total_turns || 0,
            rounds_completed: debateResult.rounds_completed || 0,
            elapsed_seconds: debateResult.elapsed_seconds || 0,
            error: null,
            created_at: cached.council_debate.generated_at,
            updated_at: cached.council_debate.generated_at,
            completed_at: cached.council_debate.generated_at,
          };

          setActiveDebateId(debateId || 'restored');
          setDebateStatus(restoredStatus);
          timestamps.council = cached.council_debate.generated_at;
        }

        // Persist timestamps in Zustand so they survive tab switches
        setStrategicTimestamps(timestamps);
        setCacheLoaded(true);
      } catch (err) {
        console.error('Failed to load strategic cache:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCache();
    return () => { cancelled = true; };
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, cacheLoaded };
}
