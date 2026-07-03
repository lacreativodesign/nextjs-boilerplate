'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AUTOMATED_CHECKS,
  MANUAL_CHECKS,
  PRODUCTION_CONFIGURATION_ITEMS,
  normalizeManualCheckId,
} from '@/lib/launch-checklist';
import { apiFetch } from '@/lib/api/client';

type AutomatedCheckResult = {
  key: (typeof AUTOMATED_CHECKS)[number]['key'];
  name: string;
  passed: boolean;
  details: string;
};

type LaunchChecklistPayload = {
  ok: boolean;
  error?: string;
  automatedChecks: AutomatedCheckResult[];
  manualChecks: Record<string, boolean>;
  productionConfiguration: Record<string, boolean>;
  readinessScore: number;
  isProductionReady: boolean;
  publicSignupsEnabled: boolean;
  launchAnnouncementSentAt: string | null;
  launchAnnouncementSentBy: string | null;
  lighthouseScore: number | null;
  generatedAt: string;
  metrics: {
    signups: number;
    activeTrials: number;
    conversionRate: number;
    revenue: number;
    errorRate: number;
    apiResponseTimeP95: number;
  };
};

function statusPill(score: number) {
  if (score >= 90) {
    return {
      label: 'Ready to Launch',
      classes: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }
  if (score >= 70) {
    return { label: 'Almost Ready', classes: 'bg-amber-100 text-amber-800 border-amber-300' };
  }
  return { label: 'Not Ready', classes: 'bg-red-100 text-red-800 border-red-300' };
}

export default function AdminLaunchChecklistPage() {
  const [data, setData] = useState<LaunchChecklistPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lighthouseInput, setLighthouseInput] = useState('90');

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiFetch('/api/admin/launch-checklist', { cache: 'no-store' });
    const payload = (await response.json()) as LaunchChecklistPayload;

    if (!response.ok || !payload.ok) {
      setError(payload.error || 'Failed to load launch checklist.');
      setLoading(false);
      return;
    }

    setData(payload);
    setLighthouseInput(String(payload.lighthouseScore ?? 90));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const execute = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusyAction(action);
      const response = await apiFetch('/api/admin/launch-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        automatedChecks?: AutomatedCheckResult[];
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error || 'Action failed.');
        setBusyAction(null);
        return;
      }

      await load();
      if (action === 'run-final-tests' && payload.automatedChecks && data) {
        setData({ ...data, automatedChecks: payload.automatedChecks });
      }
      setBusyAction(null);
    },
    [data, load],
  );

  const readiness = useMemo(() => statusPill(data?.readinessScore || 0), [data?.readinessScore]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading launch checklist…</div>;
  if (error)
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  if (!data) return null;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Production Launch Checklist</h1>
            <p className="mt-1 text-sm text-slate-500">
              Final pre-launch controls, readiness scoring, and go-live approval.
            </p>
          </div>
          <div className={`rounded-full border px-3 py-1 text-sm font-medium ${readiness.classes}`}>
            {data.readinessScore}% · {readiness.label}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Real-time Signups', data.metrics.signups],
          ['Active Trials', data.metrics.activeTrials],
          ['Trial → Paid', `${data.metrics.conversionRate}%`],
          ['Revenue (USD)', `$${data.metrics.revenue.toLocaleString()}`],
          ['Error Rate', `${data.metrics.errorRate}%`],
          ['API P95', `${data.metrics.apiResponseTimeP95} ms`],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Automated Checks</h2>
          <button
            type="button"
            className="btn"
            onClick={() => void execute('run-final-tests')}
            disabled={busyAction === 'run-final-tests'}
          >
            {busyAction === 'run-final-tests' ? 'Running…' : 'Run Final Tests'}
          </button>
        </div>
        <div className="space-y-3">
          {data.automatedChecks.map((check) => (
            <div key={check.key} className="rounded-xl border border-[var(--border-subtle)] p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{check.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    check.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {check.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{check.details}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={lighthouseInput}
            onChange={(event) => setLighthouseInput(event.target.value)}
            className="input w-28"
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => void execute('set-lighthouse-score', { score: Number(lighthouseInput) })}
            disabled={busyAction === 'set-lighthouse-score'}
          >
            Save Lighthouse Score
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Manual Verification</h2>
          <div className="space-y-4">
            {MANUAL_CHECKS.map((category) => (
              <div key={category.category}>
                <p className="text-sm font-semibold text-slate-700">{category.category}</p>
                <div className="mt-2 space-y-2">
                  {category.items.map((item) => {
                    const id = normalizeManualCheckId(item);
                    return (
                      <label key={id} className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={Boolean(data.manualChecks[id])}
                          onChange={(event) =>
                            void execute('toggle-manual', { id, checked: event.target.checked })
                          }
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Production Configuration</h2>
            <div className="space-y-2">
              {PRODUCTION_CONFIGURATION_ITEMS.map((item) => {
                const id = normalizeManualCheckId(item);
                return (
                  <label key={id} className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={Boolean(data.productionConfiguration[id])}
                      onChange={(event) =>
                        void execute('toggle-production-config', {
                          id,
                          checked: event.target.checked,
                        })
                      }
                    />
                    <span>{item}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Launch Actions</h2>
            <div className="space-y-3">
              <button
                type="button"
                className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() =>
                  void execute('set-production-ready', { checked: !data.isProductionReady })
                }
                disabled={busyAction === 'set-production-ready'}
              >
                {data.isProductionReady ? 'Unmark Production Ready' : 'Mark as Production Ready'}
              </button>
              <button
                type="button"
                className="btn ghost w-full"
                onClick={() => void execute('send-launch-announcement')}
                disabled={busyAction === 'send-launch-announcement'}
              >
                Launch Announcement Email
              </button>
              <label className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-muted)]">
                <span>Enable Public Signups</span>
                <input
                  type="checkbox"
                  checked={data.publicSignupsEnabled}
                  onChange={(event) =>
                    void execute('set-public-signups', { checked: event.target.checked })
                  }
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Announcement sent:{' '}
              {data.launchAnnouncementSentAt
                ? new Date(data.launchAnnouncementSentAt).toLocaleString()
                : 'Not sent'}
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Documentation Export</h2>
        <p className="mt-2 text-sm text-slate-600">
          Export the launch report and attach architecture diagram, API docs, deployment guide, and
          runbook from /docs.
        </p>
        <button
          type="button"
          className="btn ghost mt-3"
          onClick={() => {
            const report = {
              generatedAt: data.generatedAt,
              readinessScore: data.readinessScore,
              automatedChecks: data.automatedChecks,
              manualChecks: data.manualChecks,
              productionConfiguration: data.productionConfiguration,
              metrics: data.metrics,
              isProductionReady: data.isProductionReady,
              publicSignupsEnabled: data.publicSignupsEnabled,
            };
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            const href = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.download = `launch-report-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            URL.revokeObjectURL(href);
          }}
        >
          Generate Launch Report
        </button>
      </section>
    </div>
  );
}
