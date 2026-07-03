'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Legend,
} from 'recharts';
import type { MonitoringDashboardPayload } from '@/lib/monitoring/types';

type MonitoringResponse =
  { ok: true; data: MonitoringDashboardPayload } | { ok: false; error: string; details?: string };

const POLL_INTERVAL_MS = 30_000;

function MetricCard({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {value}
        {suffix}
      </p>
    </div>
  );
}

export default function AdminMonitoringPage() {
  const [data, setData] = useState<MonitoringDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const response = await fetch('/api/admin/monitoring/overview', { cache: 'no-store' });
      const payload = (await response.json()) as MonitoringResponse;
      if (!active) return;

      if (!payload.ok) {
        setError(payload.error);
        return;
      }

      setData(payload.data);
      setError(null);
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const timeline = useMemo(
    () =>
      (data?.windows || []).map((item) => ({
        ...item,
        time: new Date(item.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })),
    [data],
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-[var(--text-muted)]">Loading monitoring dashboard…</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Monitoring Dashboard</h1>
        <p className="page-subtitle">
          Auto-refresh every 30 seconds · Last update: {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="P95 Response Time" value={data.summary.responseTimeP95} suffix=" ms" />
        <MetricCard label="Error Rate" value={data.summary.errorRate} suffix=" %" />
        <MetricCard label="Active Users" value={data.summary.activeUsers} />
        <MetricCard label="Cache Hit Rate" value={data.summary.cacheHitRate} suffix=" %" />
        <MetricCard label="DB Query P95" value={data.summary.databaseQueryP95} suffix=" ms" />
        <MetricCard
          label="Trial → Paid"
          value={data.summary.conversionTrialToPaidRate}
          suffix=" %"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Response Time & Error Trend
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="responseTimeP95"
                  stroke="#2563eb"
                  dot={false}
                  name="Response P95 (ms)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="errorRate"
                  stroke="#dc2626"
                  dot={false}
                  name="Error Rate (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Database / Cache / Users
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="databaseQueryP95" fill="#7c3aed" name="DB P95 (ms)" />
                <Bar dataKey="cacheHitRate" fill="#16a34a" name="Cache Hit Rate (%)" />
                <Bar dataKey="activeUsers" fill="#ea580c" name="Active Users" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Endpoint Metrics
          </h2>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="py-2">Endpoint</th>
                  <th className="py-2">P95 (ms)</th>
                  <th className="py-2">Error %</th>
                  <th className="py-2">Requests</th>
                </tr>
              </thead>
              <tbody>
                {data.endpointMetrics.map((metric) => (
                  <tr key={metric.endpoint} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2 font-mono text-xs">{metric.endpoint}</td>
                    <td className="py-2">{metric.p95ResponseMs}</td>
                    <td className="py-2">{metric.errorRate}</td>
                    <td className="py-2">{metric.requests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Alert Configuration
          </h2>
          <div className="space-y-2">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 text-sm ${alert.active ? 'border-red-200 bg-red-50' : 'border-[var(--border-subtle)] bg-[var(--surface-muted)]'}`}
              >
                <p className="font-medium text-[var(--text-primary)]">{alert.label}</p>
                <p className="text-[var(--text-muted)]">
                  Channel: {alert.channel.toUpperCase()} · Threshold: {alert.comparison}{' '}
                  {alert.threshold}
                </p>
                <p className="text-[var(--text-muted)]">
                  Current: {alert.currentValue.toFixed(2)}
                  {alert.lastTriggeredAt
                    ? ` · Last triggered: ${new Date(alert.lastTriggeredAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
