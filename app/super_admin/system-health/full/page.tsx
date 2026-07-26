'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type CheckStatus = 'pass' | 'fail' | 'warning';

type HealthCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  value?: string | number;
};

type HealthResponse = {
  ok: boolean;
  checkedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: HealthCheck[];
};

export default function SuperAdminFullSystemHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/super_admin/system-health/full', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => null)) as
        HealthResponse | { error?: string } | null;

      if (!response.ok || !payload || !('summary' in payload)) {
        const message =
          payload && 'error' in payload && payload.error
            ? payload.error
            : 'Failed to load health checks';
        setError(message);
        setHealth(null);
        return;
      }

      setHealth(payload);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : 'Failed to load health checks',
      );
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const systemStatus = useMemo(() => {
    if (!health) {
      return {
        text: 'Status Unavailable',
        color: 'var(--text-muted)',
      };
    }

    if (health.summary.failed > 0) {
      return {
        text: 'Critical Issues Detected',
        color: 'var(--danger)',
      };
    }

    if (health.summary.warnings > 0) {
      return {
        text: 'Degraded',
        color: 'var(--warning)',
      };
    }

    return {
      text: 'All Systems Operational',
      color: 'var(--success)',
    };
  }, [health]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Full System Health Check</h1>
          <p className="page-subtitle">
            Platform-wide validation of core services and configuration.
          </p>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-medium hover:border-[var(--erp-blue)]"
          disabled={loading}
        >
          {loading ? 'Running…' : 'Re-run Health Check'}
        </button>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-title">Overall Status</div>
          <div className="text-sm font-semibold" style={{ color: systemStatus.color }}>
            {systemStatus.text}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Total Checks
            </div>
            <div className="mt-2 text-3xl font-semibold">{health?.summary.total ?? 0}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Passed
            </div>
            <div className="mt-2 text-3xl font-semibold" style={{ color: 'var(--success)' }}>
              {health?.summary.passed ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Failed
            </div>
            <div className="mt-2 text-3xl font-semibold" style={{ color: 'var(--danger)' }}>
              {health?.summary.failed ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Warnings
            </div>
            <div className="mt-2 text-3xl font-semibold" style={{ color: 'var(--warning)' }}>
              {health?.summary.warnings ?? 0}
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-[var(--text-muted)]">
          Last checked: {health?.checkedAt ? new Date(health.checkedAt).toLocaleString() : '—'}
        </div>
      </div>

      <div className="card p-5">
        <div className="section-title">Check Results</div>
        <p className="section-subtitle">Each check is isolated and reports its own status.</p>

        {loading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={`loading-check-${index}`}
                className="h-16 animate-pulse rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {health?.checks.map((check) => {
              const indicator = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
              const color =
                check.status === 'pass'
                  ? 'var(--success)'
                  : check.status === 'fail'
                    ? 'var(--danger)'
                    : 'var(--warning)';

              return (
                <div key={check.id} className="rounded-xl border border-[var(--border-subtle)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 text-lg font-semibold"
                        style={{ color }}
                      >
                        {indicator}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {check.name}
                        </div>
                        <div className="text-sm text-[var(--text-muted)]">{check.message}</div>
                      </div>
                    </div>
                    {typeof check.value !== 'undefined' && (
                      <div className="text-sm font-medium text-[var(--text-muted)]">
                        {String(check.value)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
