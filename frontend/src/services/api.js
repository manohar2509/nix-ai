import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Base API client — Cognito-integrated with production resilience
 *
 * Features:
 * - Request interceptor injects Cognito ID-Token in Authorization header
 * - Automatic retry with exponential backoff for transient failures
 * - On 401 → attempts a forced token refresh and retries the request once
 * - If refresh fails → redirects to /login
 * - Request ID tracing for debugging
 * - Timeout + dev logging
 * - Circuit-aware error handling (respects 503 Retry-After)
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Retry Configuration ────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 15000;
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Calculate delay with exponential backoff + jitter
 */
function calculateRetryDelay(attempt) {
  const exponentialDelay = Math.min(
    BASE_DELAY_MS * Math.pow(2, attempt),
    MAX_DELAY_MS
  );
  // Full jitter: random between 0 and calculated delay
  return Math.random() * exponentialDelay;
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId() {
  return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,  // 60s for LLM-heavy operations
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Inject Cognito JWT (ID Token) + Request ID
 */
apiClient.interceptors.request.use(
  async (config) => {
    // Add request ID for tracing
    config.headers['X-Request-Id'] = config.headers['X-Request-Id'] || generateRequestId();

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // No active Cognito session — proceed without token
    }

    // Dev logging
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method.toUpperCase()} ${config.url}`, config.data);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle errors globally with retry logic
 *
 * Retry policy:
 *   - 429 (Rate Limited): Retry with backoff, respect Retry-After header
 *   - 500/502/503/504: Retry with exponential backoff + jitter
 *   - 401: Force-refresh Cognito token and retry once
 *   - 4xx: Don't retry (client errors)
 */
apiClient.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      const requestId = response.headers['x-request-id'] || 'unknown';
      const responseTime = response.headers['x-response-time'] || '?';
      console.log(`[API] Response: ${response.status} [${requestId}] (${responseTime})`, response.data);
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const message = error.response?.data?.error || error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.error_code || 'UNKNOWN';
    const isRetryable = error.response?.data?.retryable;

    if (import.meta.env.DEV) {
      console.error(`[API] Error: ${status} (${errorCode})`, message);
    }

    // ── Handle 401 (Unauthorized) — attempt token refresh + retry ──
    if (status === 401 && !config._retry401) {
      config._retry401 = true;

      try {
        const session = await fetchAuthSession({ forceRefresh: true });
        if (session.tokens) {
          config.headers.Authorization = `Bearer ${session.tokens.idToken.toString()}`;
          return apiClient.request(config);
        }
      } catch {
        // Token refresh failed — session expired
      }

      window.location.href = '/login';
      return Promise.reject(error);
    }

    // ── Handle retryable errors (429, 5xx) with exponential backoff ──
    const retryCount = config._retryCount || 0;
    const shouldRetry = (
      retryCount < MAX_RETRIES &&
      (RETRYABLE_STATUS_CODES.includes(status) || isRetryable) &&
      !config._noRetry  // Allow callers to disable retry
    );

    if (shouldRetry) {
      config._retryCount = retryCount + 1;

      // Respect Retry-After header if present (for 429/503)
      let delay;
      const retryAfter = error.response?.headers?.['retry-after'];
      if (retryAfter) {
        delay = parseInt(retryAfter, 10) * 1000;  // Convert seconds to ms
      } else {
        delay = calculateRetryDelay(retryCount);
      }

      if (import.meta.env.DEV) {
        console.warn(
          `[API] Retry ${config._retryCount}/${MAX_RETRIES} for ${config.url} ` +
          `(${status} ${errorCode}). Waiting ${Math.round(delay)}ms...`
        );
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      return apiClient.request(config);
    }

    // ── Build structured error for callers ──
    const apiError = new Error(message || 'Something went wrong. Please try again.');
    apiError.status = status;
    apiError.errorCode = errorCode;
    apiError.retryable = isRetryable;
    apiError.data = error.response?.data;
    apiError.requestId = error.response?.headers?.['x-request-id'] || config.headers?.['X-Request-Id'];

    // Add user-friendly messages for common errors
    if (status === 429) {
      apiError.userMessage = 'The system is experiencing high demand. Please wait a moment and try again.';
    } else if (status === 502 || errorCode === 'AI_SERVICE_ERROR') {
      apiError.userMessage = 'The AI service encountered a temporary issue. Please try again.';
    } else if (status === 503) {
      apiError.userMessage = 'The service is temporarily unavailable. It will recover automatically.';
    } else if (status >= 500) {
      apiError.userMessage = 'An unexpected error occurred. Please try again or contact support.';
    }

    return Promise.reject(apiError);
  }
);

export default apiClient;
