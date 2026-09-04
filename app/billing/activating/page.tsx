'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BillingActivatingPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Confirming your secure Bizosto workspace…');

  useEffect(() => {
    let cancelled = false;

    async function waitForActivation() {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt += 1) {
        try {
          const response = await fetch('/api/subscription/status', {
            credentials: 'include',
            cache: 'no-store',
          });

          if (response.status === 401) {
            router.replace('/login');
            return;
          }

          const data = await response.json().catch(() => null);
          const state = String(data?.subscriptionState || '').toLowerCase();

          if (response.ok && data?.ok && (state === 'trial' || state === 'active')) {
            router.replace('/onboarding?signup=success');
            return;
          }

          if (response.ok && data?.ok && state !== 'pending_checkout') {
            setMessage('Your billing status needs attention. Opening billing…');
            router.replace('/billing');
            return;
          }
        } catch {
          // A transient network edge should not turn a successful Stripe checkout into a failed
          // signup. Keep polling the server-owned subscription status for the bounded window.
        }

        await sleep(POLL_INTERVAL_MS);
      }

      if (!cancelled) {
        setMessage('Activation is taking longer than expected. Opening billing so you can retry.');
        window.setTimeout(() => router.replace('/billing'), 1200);
      }
    }

    void waitForActivation();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <div
          className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-[var(--border-subtle)] border-t-[var(--brand-blue)]"
          aria-hidden="true"
        />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Activating Bizosto</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]" aria-live="polite">
          {message}
        </p>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Keep this page open while we confirm your Stripe checkout.
        </p>
      </section>
    </main>
  );
}
