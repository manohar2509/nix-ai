import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Base API client — Cognito-integrated
 *
 * Features:
 * - Request interceptor injects Cognito ID-Token in Authorization header
 * - On 401 → attempts a forced token refresh and retries the request once
 * - If refresh fails → redirects to /login
 * - Timeout + dev logging
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Inject Cognito JWT (ID Token) if session exists
 *
 * `fetchAuthSession()` returns cached tokens and auto-refreshes
 * them when they're close to expiry — no manual refresh needed.
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // No active Cognito session — proceed without token
      // (public endpoints or pre-login requests)
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
 * Response interceptor: Handle errors globally
 *
 * 401 flow:
 *   1. Force-refresh the Cognito session
 *   2. If new tokens obtained → retry the original request
 *   3. If refresh fails → redirect to /login
 */
apiClient.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`[API] Response: ${response.status}`, response.data);
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (import.meta.env.DEV) {
      console.error(`[API] Error: ${status}`, message);
    }

    // Handle 401 (Unauthorized) — attempt token refresh + retry
    if (status === 401 && !error.config._retry) {
      error.config._retry = true; // prevent infinite retry loop

      try {
        const session = await fetchAuthSession({ forceRefresh: true });
        if (session.tokens) {
          // Got fresh tokens — retry the original request
          error.config.headers.Authorization = `Bearer ${session.tokens.idToken.toString()}`;
          return apiClient.request(error.config);
        }
      } catch {
        // Token refresh failed — session expired
      }

      // Could not recover → redirect to login
      window.location.href = '/login';
    }

    return Promise.reject({
      status,
      message,
      data: error.response?.data,
    });
  }
);

export default apiClient;
