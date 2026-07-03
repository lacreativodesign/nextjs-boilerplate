'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SESSION_CONFIG } from '@/lib/auth/sessionConfig';

const WARNING_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function useSessionTimeout() {
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(Math.ceil(SESSION_CONFIG.idleTimeout / 1000));

  const lastActivityRef = useRef<number>(Date.now());
  const lastRefreshRef = useRef<number>(0);
  const warningShownRef = useRef<boolean>(false);

  const refreshSession = useCallback(async () => {
    try {
      await fetch('/api/auth/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (error) {
      console.error('Failed to refresh session', error);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } finally {
      window.location.href = '/login';
    }
  }, []);

  const extendSession = useCallback(async () => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    setShowTimeoutWarning(false);
    await refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const markActivity = () => {
      lastActivityRef.current = Date.now();
      if (warningShownRef.current) {
        warningShownRef.current = false;
        setShowTimeoutWarning(false);
      }
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity));
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remaining = Math.max(0, SESSION_CONFIG.idleTimeout - elapsed);

      setTimeRemaining(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        logout();
        return;
      }

      if (remaining <= WARNING_WINDOW_MS && !warningShownRef.current) {
        warningShownRef.current = true;
        setShowTimeoutWarning(true);
      }

      if (now - lastRefreshRef.current >= REFRESH_INTERVAL_MS && elapsed < REFRESH_INTERVAL_MS) {
        lastRefreshRef.current = now;
        void refreshSession();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [logout, refreshSession]);

  return {
    showTimeoutWarning,
    timeRemaining,
    extendSession,
    logout,
  };
}
