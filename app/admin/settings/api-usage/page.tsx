"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";
import UsageChartsSkeleton from "./_components/UsageChartsSkeleton";
import { apiFetch } from "@/lib/api/client";

type UsageStats = {
  totalCalls: number;
  endpointStats: Array<{ endpoint: string; count: number }>;
  timeSeries: Array<{ bucket: string; count: number }>;
  topConsumers: Array<{ tenantId: string; userId: string; count: number }>;
};

type UsageLog = {
  id: string;
  endpoint: string;
  tenantId: string;
  userId: string;
  method: string;
  status: number;
  responseTimeMs: number;
  createdAt: string;
};

const UsageCharts = dynamic(() => import("./_components/UsageCharts"), {
  ssr: false,
  loading: () => <UsageChartsSkeleton />,
});


const EMPTY_STATS: UsageStats = {
  totalCalls: 0,
  endpointStats: [],
  timeSeries: [],
  topConsumers: [],
};

export default function ApiUsageSettingsPage() {
  const [stats, setStats] = useState<UsageStats>(EMPTY_STATS);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [ruleForm, setRuleForm] = useState({ endpointPattern: "/api/*", limit: 120, windowSeconds: 60, scope: "both", priority: 1 });
  const [quotaForm, setQuotaForm] = useState({ tenantId: "", plan: "growth", dailyLimit: 10000, monthlyLimit: 250000 });

  const load = async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        apiFetch("/api/admin/usage/stats", { cache: "no-store" }),
        apiFetch("/api/admin/usage/logs?pageSize=50", { cache: "no-store" }),
      ]);

      const statsJson = await statsRes.json();
      const logsJson = await logsRes.json();

      if (!statsRes.ok || !statsJson.ok) throw new Error(statsJson.error || "Failed loading usage stats");
      if (!logsRes.ok || !logsJson.ok) throw new Error(logsJson.error || "Failed loading usage logs");

      setStats(statsJson.stats);
      setLogs(logsJson.logs);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed loading API usage data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const realtimePoints = useMemo(() => stats.timeSeries.slice(-24), [stats.timeSeries]);

  const saveRule = async () => {
    const res = await apiFetch("/api/admin/rate-limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleForm),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save rule");
    await load();
  };

  const saveQuota = async () => {
    const res = await apiFetch("/api/admin/quotas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quotaForm),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save quota");
    await load();
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}

      <section className="card p-5 rounded-xl settings-section">
        <h3 className="font-semibold">API Usage Dashboard</h3>
        <p className="text-sm opacity-70">Total API calls: {loading ? "Loading..." : stats.totalCalls.toLocaleString()}</p>
        <UsageCharts endpointStats={stats.endpointStats} realtimePoints={realtimePoints} />
      </section>

      <section className="card p-5 rounded-xl settings-section">
        <h3 className="font-semibold mb-3">Top API Consumers</h3>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">Tenant</th>
                <th className="text-left p-2">User</th>
                <th className="text-right p-2">Requests</th>
              </tr>
            </thead>
            <tbody>
              {stats.topConsumers.map((row) => (
                <tr key={`${row.tenantId}:${row.userId}`}>
                  <td className="p-2">{row.tenantId}</td>
                  <td className="p-2">{row.userId}</td>
                  <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 rounded-xl settings-section space-y-3">
          <h3 className="font-semibold">Rate Limit Rule Manager</h3>
          <input className="input" value={ruleForm.endpointPattern} onChange={(e) => setRuleForm({ ...ruleForm, endpointPattern: e.target.value })} placeholder="/api/auth/*" />
          <input className="input" type="number" value={ruleForm.limit} onChange={(e) => setRuleForm({ ...ruleForm, limit: Number(e.target.value) })} placeholder="Limit" />
          <input className="input" type="number" value={ruleForm.windowSeconds} onChange={(e) => setRuleForm({ ...ruleForm, windowSeconds: Number(e.target.value) })} placeholder="Window seconds" />
          <select className="input" value={ruleForm.scope} onChange={(e) => setRuleForm({ ...ruleForm, scope: e.target.value })}>
            <option value="both">Tenant + User</option>
            <option value="tenant">Tenant only</option>
            <option value="user">User only</option>
          </select>
          <button className="btn" onClick={() => saveRule().catch((e) => setError(e.message))}>Save Rule</button>
        </div>

        <div className="card p-5 rounded-xl settings-section space-y-3">
          <h3 className="font-semibold">Quota Enforcement Settings</h3>
          <input className="input" value={quotaForm.tenantId} onChange={(e) => setQuotaForm({ ...quotaForm, tenantId: e.target.value })} placeholder="Tenant ID" />
          <input className="input" value={quotaForm.plan} onChange={(e) => setQuotaForm({ ...quotaForm, plan: e.target.value })} placeholder="Plan" />
          <input className="input" type="number" value={quotaForm.dailyLimit} onChange={(e) => setQuotaForm({ ...quotaForm, dailyLimit: Number(e.target.value) })} placeholder="Daily limit" />
          <input className="input" type="number" value={quotaForm.monthlyLimit} onChange={(e) => setQuotaForm({ ...quotaForm, monthlyLimit: Number(e.target.value) })} placeholder="Monthly limit" />
          <button className="btn" onClick={() => saveQuota().catch((e) => setError(e.message))}>Save Quota</button>
        </div>
      </section>

      <section className="card p-5 rounded-xl settings-section">
        <h3 className="font-semibold mb-3">Recent API Logs</h3>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">Endpoint</th>
                <th className="text-left p-2">Tenant</th>
                <th className="text-left p-2">User</th>
                <th className="text-right p-2">Status</th>
                <th className="text-right p-2">Response (ms)</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="p-2">{log.method} {log.endpoint}</td>
                  <td className="p-2">{log.tenantId}</td>
                  <td className="p-2">{log.userId}</td>
                  <td className="p-2 text-right">{log.status}</td>
                  <td className="p-2 text-right">{log.responseTimeMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
