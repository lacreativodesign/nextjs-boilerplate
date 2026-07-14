'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * S15: CSP readiness console.
 *
 * A strict, nonce-based Content-Security-Policy runs today in REPORT-ONLY mode — it records
 * what it would block, but blocks nothing. Promoting it to enforced is the last significant
 * XSS hardening step, and it was deferred indefinitely because a previous attempt produced a
 * blank screen and nobody could see the violation reports (they were only written to
 * ephemeral platform logs).
 *
 * This page shows what the strict policy would actually block. An empty list, after a
 * representative period of real usage across every role, is the evidence that enforcement is
 * safe to turn on.
 */
type Violation = {
  id: string;
  directive: string;
  blockedOrigin: string;
  documentPath: string;
  count: number;
  lastSeenAt: string | null;
};

export default function SuperAdminSecurityPage() {
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/super_admin/security/csp-violations', {
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        violations?: Violation[];
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Request failed (${res.status})`);
        return;
      }
      setViolations(payload.violations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function clearAll() {
    if (!window.confirm('Clear all recorded violations and start a fresh observation window?')) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/super_admin/security/csp-violations', { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const isClean = violations !== null && violations.length === 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Content Security Policy
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          A strict, nonce-based CSP is running in <strong>report-only</strong> mode: it records
          what it would block, but blocks nothing. Everything listed below is something the
          strict policy <em>would</em> have blocked if enforcement were switched on.
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Exercise the app across every role for a few days. When this list stays empty, the
          policy is safe to enforce.
        </p>
      </header>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
        >
          {busy ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={busy || !violations?.length}
          className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-40"
        >
          Start fresh window
        </button>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
          {error}
        </p>
      )}

      {isClean && (
        <p className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-5 text-sm text-[var(--text-primary)]">
          <strong>No violations recorded.</strong> If the app has been used broadly since the
          last reset, the strict policy is a candidate for enforcement.
        </p>
      )}

      {violations && violations.length > 0 && (
        <section className="mt-6 space-y-3">
          {violations.map((v) => (
            <article
              key={v.id}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-mono text-sm font-bold text-[var(--text-primary)]">
                  {v.directive}
                </h2>
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  seen {v.count}×
                </span>
              </div>
              <p className="mt-2 break-all text-sm text-[var(--text-muted)]">
                <strong className="text-[var(--text-primary)]">Blocked:</strong>{' '}
                {v.blockedOrigin}
              </p>
              <p className="mt-1 break-all text-sm text-[var(--text-muted)]">
                <strong className="text-[var(--text-primary)]">On page:</strong>{' '}
                {v.documentPath}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
