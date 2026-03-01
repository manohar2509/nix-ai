/**
 * Theme hook — reads user preference from localStorage and applies
 * a `dark` class on <html> so Tailwind's dark: variants work.
 *
 * Supports three modes:
 *   - "light"  → always light
 *   - "dark"   → always dark
 *   - "system" → follows OS prefers-color-scheme
 */

import { useEffect, useCallback } from 'react';

const STORAGE_KEY = 'nixai-user-preferences';

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored).theme || 'system';
    }
  } catch {
    // ignore
  }
  return 'system';
}

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else if (mode === 'light') {
    root.classList.remove('dark');
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

/**
 * Call this hook once at the App root to keep the dark class in sync.
 */
export function useThemeInit() {
  useEffect(() => {
    const theme = getStoredTheme();
    applyTheme(theme);

    // Listen for OS changes when in "system" mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getStoredTheme() === 'system') {
        applyTheme('system');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Also listen for localStorage changes (e.g. from ConfigurationView save)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        const theme = getStoredTheme();
        applyTheme(theme);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}

/**
 * Call this after saving preferences in ConfigurationView to
 * immediately apply the new theme without a page reload.
 */
export function applyCurrentTheme() {
  applyTheme(getStoredTheme());
}
