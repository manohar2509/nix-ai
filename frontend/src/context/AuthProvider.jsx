import { useEffect } from 'react';
import { Hub } from 'aws-amplify/utils';
import { useAppStore } from '../stores/useAppStore';
import authService from '../services/authService';

/**
 * AuthProvider — Cognito Session Manager
 *
 * Responsibilities:
 * 1. On mount: check if a Cognito session already exists (page refresh / returning user)
 * 2. Listen for Amplify Hub auth events (signedIn, signedOut, tokenRefresh, tokenRefresh_failure)
 * 3. Sync Cognito state → Zustand store so every component stays in sync
 *
 * Token lifecycle (handled by Amplify automatically):
 *   - Access / ID tokens are cached in-memory + localStorage
 *   - On expiry Amplify refreshes them via the Refresh Token
 *   - If refresh fails the Hub emits 'tokenRefresh_failure' → we clear auth
 */

export const AuthProvider = ({ children }) => {
  const setUser = useAppStore((state) => state.setUser);
  const setAuthLoading = useAppStore((state) => state.setAuthLoading);
  const setAuthError = useAppStore((state) => state.setAuthError);
  const clearAuth = useAppStore((state) => state.clearAuth);

  useEffect(() => {
    // ── 1. Check existing session on mount ──
    const initializeAuth = async () => {
      setAuthLoading(true);
      try {
        const cognitoUser = await authService.getCurrentUser();

        if (cognitoUser) {
          // Session exists → build full user object from Cognito attributes
          const user = await authService.buildUserObject();
          if (user) {
            setUser(user);
          } else {
            // Attributes couldn't be fetched — session might be stale
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        setAuthError('Unable to restore your session. Please sign in again.');
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    initializeAuth();

    // ── 2. Subscribe to Amplify Hub auth events ──
    const unsubscribe = Hub.listen('auth', async ({ payload }) => {
      switch (payload.event) {
        case 'signedIn': {
          try {
            const user = await authService.buildUserObject();
            if (user) {
              setUser(user);
            }
          } catch (err) {
            console.error('Failed to load user after signIn:', err);
            setAuthError('Unable to load your profile. Please try signing in again.');
          }
          break;
        }

        case 'signedOut':
          clearAuth();
          break;

        case 'tokenRefresh':
          // Tokens refreshed silently — no action needed
          if (import.meta.env.DEV) {
            console.log('[Auth] Tokens refreshed successfully');
          }
          break;

        case 'tokenRefresh_failure':
          // Refresh token expired or revoked → force logout
          console.error('[Auth] Token refresh failed — signing out');
          clearAuth();
          break;

        default:
          break;
      }
    });

    // ── 3. Cleanup listener on unmount ──
    return () => unsubscribe();
  }, [setUser, setAuthLoading, setAuthError, clearAuth]);

  return children;
};

export default AuthProvider;
