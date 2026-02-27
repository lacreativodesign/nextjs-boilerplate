"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CheckStatus = "pass" | "fail" | "warning";

type HealthCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  value?: string | number;
};

type SentryConfig = {
  NEXT_PUBLIC_SENTRY_DSN: boolean;
  SENTRY_ORG: boolean;
  SENTRY_PROJECT: boolean;
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: boolean;
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: boolean;
};

type HealthResponse = {
  ok: boolean;
  checks: HealthCheck[];
  sentryConfig?: SentryConfig;
};

type TestType = "error" | "message" | "performance";

const TEST_LABELS: Record<TestType, string> = {
  error: "Send Test Error",
  message: "Send Test Message",
  performance: "Test Performance Tracking",
};

export default function SuperAdminMonitoringPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState<TestType | null>(null);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);

    try {
      const response = await fetch("/api/super_admin/system-health/full", {
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as HealthResponse | { error?: string } | null;
      if (!response.ok || !payload || !("checks" in payload)) {
        const message = payload && "error" in payload && payload.error ? payload.error : "Failed to load monitoring status";
        setHealthError(message);
        setHealth(null);
        return;
      }

      setHealth(payload);
    } catch (error: unknown) {
      setHealthError(error instanceof Error ? error.message : "Failed to load monitoring status");
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const sentryCheck = useMemo(
    () => health?.checks.find((check) => check.id === "sentry") ?? null,
    [health]
  );

  const sentryStatus = sentryCheck?.status ?? "warning";

  const runTest = useCallback(async (type: TestType) => {
    setTestLoading(type);
    setTestResult(null);

    try {
      const response = await fetch(`/api/super_admin/sentry-test?type=${type}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setTestResult({
          status: "error",
          message: payload?.error || "Failed to send Sentry test event.",
        });
        return;
      }

      if (type === "error") {
        setTestResult({
          status: "success",
          message: "✓ Test error sent to Sentry. Check your Sentry dashboard in a few seconds.",
        });
        return;
      }

      if (type === "message") {
        setTestResult({
          status: "success",
          message: "✓ Test message sent.",
        });
        return;
      }

      setTestResult({
        status: "success",
        message: "✓ Test transaction sent.",
      });
    } catch (error: unknown) {
      setTestResult({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to send Sentry test event.",
      });
    } finally {
      setTestLoading(null);
    }
  }, []);

  const checklist = health?.sentryConfig;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Error Monitoring</h1>
          <p className="page-subtitle">Sentry integration status and error tracking configuration</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="section-title">Sentry Status</div>
        {healthLoading ? (
          <div className="mt-3 text-sm text-[var(--text-muted)]">Loading Sentry status…</div>
        ) : healthError ? (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{healthError}</div>
        ) : sentryStatus === "pass" ? (
          <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <div className="text-sm font-semibold text-emerald-300">● Active</div>
            <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Sentry is Active</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Error monitoring is running. All client, server, and edge errors are being captured.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="text-sm font-semibold text-amber-300">● Not Configured</div>
              <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Sentry Not Configured</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Add your NEXT_PUBLIC_SENTRY_DSN environment variable in Vercel to enable error monitoring.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Setup Instructions</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                <li>Go to sentry.io and create a new project (Next.js)</li>
                <li>Copy your DSN from: Project Settings → Client Keys → DSN</li>
                <li>
                  Add to Vercel: Project → Settings → Environment Variables → NEXT_PUBLIC_SENTRY_DSN
                </li>
                <li>Redeploy for the change to take effect</li>
                <li>Return here and click "Test Sentry" to verify</li>
              </ol>
            </div>
          </>
        )}
      </div>

      <div className="card p-5">
        <div className="section-title">Test Sentry Panel (test only)</div>
        <p className="section-subtitle">Trigger controlled test events to verify Sentry ingestion.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(["error", "message", "performance"] as TestType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => runTest(type)}
              disabled={Boolean(testLoading)}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-sm font-medium hover:border-[var(--erp-blue)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testLoading === type ? "Sending…" : TEST_LABELS[type]}
            </button>
          ))}
        </div>

        {testResult && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              testResult.status === "success"
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border border-red-500/40 bg-red-500/10 text-red-200"
            }`}
          >
            {testResult.message}
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Test events will appear in your Sentry dashboard under Issues (errors) or Performance (transactions) within a few seconds.
        </p>
      </div>

      <div className="card p-5">
        <div className="section-title">Configuration Checklist</div>
        <div className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
          <div>
            {checklist?.NEXT_PUBLIC_SENTRY_DSN ? "✅" : "❌"} NEXT_PUBLIC_SENTRY_DSN
          </div>
          <div>{checklist?.SENTRY_ORG ? "✅" : "❌"} SENTRY_ORG</div>
          <div>{checklist?.SENTRY_PROJECT ? "✅" : "❌"} SENTRY_PROJECT</div>
          <div>
            {checklist?.NEXT_PUBLIC_SENTRY_ENVIRONMENT ? "✅" : "⚠️"} NEXT_PUBLIC_SENTRY_ENVIRONMENT
            {!checklist?.NEXT_PUBLIC_SENTRY_ENVIRONMENT && " — defaults to NODE_ENV if not set"}
          </div>
          <div>
            {checklist?.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ? "✅" : "⚠️"} NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
            {!checklist?.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE && " — defaults to 0.1"}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="section-title">Sentry Dashboard</div>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          View all captured errors, performance data, and user sessions in your Sentry dashboard.
        </p>
        <a
          href="https://sentry.io"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-medium hover:border-[var(--erp-blue)]"
        >
          Open Sentry Dashboard →
        </a>
      </div>

      <div className="card p-5">
        <div className="section-title">What is Being Monitored</div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
          <li>Client-side JavaScript errors — all React component errors and unhandled exceptions</li>
          <li>Server-side API errors — all Next.js API route errors with stack traces</li>
          <li>Edge middleware errors — middleware failures and routing errors</li>
          <li>User context — authenticated user ID, email, tenant ID, and role attached to every error</li>
          <li>Performance — page load times and API response times (10% sample rate)</li>
          <li>Session replays — recorded on error occurrence (blocked media, masked text)</li>
          <li>Error boundaries — global and route-level React error boundaries</li>
        </ul>
      </div>
    </div>
  );
}
