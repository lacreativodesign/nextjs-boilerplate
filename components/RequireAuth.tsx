'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchUserRole, getFirebaseAuth } from '@/lib/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import type { Unsubscribe } from 'firebase/auth';
import SubscriptionBanner from '@/components/SubscriptionBanner';
import { normalizeRole } from '@/lib/erpAccess';
import SessionTimeoutModal from '@/components/auth/SessionTimeoutModal';
import { useSessionTimeout } from '@/lib/hooks/useSessionTimeout';

type Props = {
  allowed: string[];
  children: React.ReactNode;
};

function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--app-bg)',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid var(--border-subtle)',
          borderTopColor: 'var(--erp-blue)',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Loading your workspace…</p>
    </div>
  );
}

function RecoveryScreen({ onRetry, onSignIn }: { onRetry: () => void; onSignIn: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--app-bg)',
        gap: '16px',
      }}
    >
      <p style={{ color: 'var(--text-primary)', fontSize: 16, margin: 0 }}>
        We couldn&apos;t load your session.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={onRetry}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: '1px solid var(--input-border)',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Retry
        </button>
        <button
          onClick={onSignIn}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--erp-blue)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Sign in again
        </button>
      </div>
    </div>
  );
}

export default function RequireAuth({ allowed, children }: Props) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const redirectingRef = useRef(false);
  const router = useRouter();
  const allowedRoles = useMemo(
    () => allowed.map((role) => normalizeRole(role)).filter(Boolean),
    [allowed],
  );
  const { showTimeoutWarning, timeRemaining, extendSession, logout } = useSessionTimeout();

  // Watchdog: show recovery if auth hasn't resolved within 8 s.
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [ready]);

  useEffect(() => {
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    getFirebaseAuth()
      .then((auth) => {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, async (user) => {
          if (!user) {
            try {
              const res = await fetch('/api/tenant/context', { credentials: 'include' });
              if (res.ok) {
                const data = await res.json();
                const role = normalizeRole(data?.user?.role);
                if (role === 'super_admin') {
                  setOk(true);
                  setReady(true);
                  return;
                }
                if (role && allowedRoles.includes(role)) {
                  setOk(true);
                  setReady(true);
                  return;
                }
                redirectingRef.current = true;
                router.replace(role ? '/unauthorized' : '/login');
                setReady(true);
                return;
              }
            } catch {
              // network error — fall through to redirect
            }
            redirectingRef.current = true;
            router.replace('/login');
            setReady(true);
            return;
          }

          const role = normalizeRole(await fetchUserRole(user.uid));

          // super_admin bypasses all route restrictions
          if (role === 'super_admin') {
            setOk(true);
            setReady(true);
            return;
          }

          if (!role || !allowedRoles.includes(role)) {
            redirectingRef.current = true;
            router.replace(role ? '/unauthorized' : '/login');
            setReady(true);
            return;
          }

          setOk(true);
          setReady(true);
        });
      })
      .catch((err) => {
        console.error('Failed to load Firebase auth', err);
        redirectingRef.current = true;
        router.replace('/login');
        setReady(true);
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [allowedRoles, router]);

  if (!ready) {
    if (timedOut) {
      return (
        <RecoveryScreen
          onRetry={() => window.location.reload()}
          onSignIn={() => router.replace('/login')}
        />
      );
    }
    return <LoadingScreen />;
  }

  if (!ok) {
    if (!redirectingRef.current) {
      return (
        <RecoveryScreen
          onRetry={() => window.location.reload()}
          onSignIn={() => router.replace('/login')}
        />
      );
    }
    return null;
  }

  return (
    <>
      <SessionTimeoutModal
        open={showTimeoutWarning}
        timeRemaining={timeRemaining}
        onStayLoggedIn={extendSession}
        onLogout={logout}
      />
      <SubscriptionBanner />
      {children}
    </>
  );
}
