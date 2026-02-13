"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../../_components/SettingsAlert";

type SyncSettings = {
  syncInvoicesToXero: boolean;
  syncPaymentsFromXero: boolean;
  syncContactsTwoWay: boolean;
  syncAccounts: boolean;
  syncTaxRates: boolean;
  scheduleDaily: boolean;
  conflictMode: "last_write_wins" | "manual";
};

type SyncStats = {
  lastSyncStartedAt: string | null;
  lastSyncFinishedAt: string | null;
  lastSyncStatus: "idle" | "running" | "success" | "error";
  lastSyncError: string | null;
};

type SyncCursor = {
  fullSyncCompletedAt: string | null;
  invoicesLastSyncAt: string | null;
  paymentsLastSyncAt: string | null;
  contactsLastSyncAt: string | null;
  accountsLastSyncAt: string | null;
  taxRatesLastSyncAt: string | null;
};

type StatusResponse = {
  connected: boolean;
  organizationId: string | null;
  organizationName: string | null;
  scopes: string[];
  settings: SyncSettings | null;
  stats: SyncStats | null;
  cursor: SyncCursor | null;
};

export default function XeroIntegrationPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch("/api/integrations/xero/status", { cache: "no-store", credentials: "include" }),
        fetch("/api/integrations/xero/logs?limit=30", { cache: "no-store", credentials: "include" }),
      ]);
      const statusData = await statusRes.json();
      const logsData = await logsRes.json();
      if (!statusRes.ok || !statusData?.ok) throw new Error(statusData?.error || "Unable to load Xero status.");
      if (!logsRes.ok || !logsData?.ok) throw new Error(logsData?.error || "Unable to load Xero logs.");
      setStatus(statusData.status || null);
      setLogs(Array.isArray(logsData.logs) ? logsData.logs : []);
    } catch (err: any) {
      setError(err.message || "Unable to load Xero integration state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = () => {
    window.location.href = "/api/integrations/xero/authorize?returnTo=/admin/settings/integrations/xero";
  };

  const updateSettings = async (patch: Partial<SyncSettings>) => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/integrations/xero/status", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to update Xero settings.");
      setSuccess("Settings saved.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const runSync = async (forceInitial: boolean) => {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/integrations/xero/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceInitial }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Xero sync failed.");
      setSuccess(forceInitial ? "Initial sync completed." : "Incremental sync completed.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to run sync.");
    } finally {
      setSyncing(false);
    }
  };

  const settings = status?.settings;
  const stats = status?.stats;

  const statusTone = useMemo(() => {
    if (!status?.connected) return "Disconnected";
    if (stats?.lastSyncStatus === "error") return "Sync error";
    if (stats?.lastSyncStatus === "running") return "Sync running";
    if (stats?.lastSyncStatus === "success") return "Healthy";
    return "Connected";
  }, [status, stats]);

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Xero</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Two-way accounting sync for invoices, payments, contacts, accounts, and tax rates.</p>
          </div>
          <button className="btn subtle" type="button" onClick={connect} disabled={loading || saving || syncing}>
            {status?.connected ? "Reconnect Xero" : "Connect Xero"}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="card" style={{ padding: 14, borderRadius: 14 }}>
            <div style={{ fontWeight: 700 }}>Connection</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>{status?.connected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{status?.organizationName || status?.organizationId || "No organization linked"}</div>
          </div>
          <div className="card" style={{ padding: 14, borderRadius: 14 }}>
            <div style={{ fontWeight: 700 }}>Sync Status</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>{statusTone}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Last run: {stats?.lastSyncFinishedAt || "Never"}</div>
          </div>
          <div className="card" style={{ padding: 14, borderRadius: 14 }}>
            <div style={{ fontWeight: 700 }}>Conflict Resolution</div>
            <select
              className="input"
              value={settings?.conflictMode || "last_write_wins"}
              disabled={!status?.connected || saving}
              onChange={(e) => void updateSettings({ conflictMode: e.target.value as SyncSettings["conflictMode"] })}
            >
              <option value="last_write_wins">Last write wins</option>
              <option value="manual">Manual review (skip local newer records)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Sync Settings</div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["syncInvoicesToXero", "Sync invoices (Bizosto → Xero)"],
            ["syncPaymentsFromXero", "Sync payments (Xero → Bizosto)"],
            ["syncContactsTwoWay", "Sync contacts two-way"],
            ["syncAccounts", "Sync chart of accounts"],
            ["syncTaxRates", "Sync tax rates"],
            ["scheduleDaily", "Run daily scheduled sync"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 card" style={{ padding: 10, borderRadius: 12 }}>
              <input type="checkbox" checked={Boolean((settings as any)?.[key])} disabled={!status?.connected || saving} onChange={(e) => void updateSettings({ [key]: e.target.checked } as Partial<SyncSettings>)} />
              <span style={{ fontSize: 14 }}>{label}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn" type="button" disabled={!status?.connected || syncing} onClick={() => void runSync(false)}>
            Run Incremental Sync
          </button>
          <button className="btn subtle" type="button" disabled={!status?.connected || syncing} onClick={() => void runSync(true)}>
            Run Initial Sync
          </button>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Sync History</div>
        {loading ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>Loading logs…</div>
        ) : logs.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>No sync runs yet.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="card" style={{ padding: 12, borderRadius: 12 }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{String(log.status || "unknown").toUpperCase()}</strong>
                  <span style={{ fontSize: 12 }}>{log.startedAt || ""}</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Mode: {log.mode || "n/a"} · Conflicts: {Number(log.conflicts || 0)} · Invoices: {Number(log.invoices?.updated || 0) + Number(log.invoices?.inserted || 0)} · Payments: {Number(log.payments?.updated || 0) + Number(log.payments?.inserted || 0)}
                </div>
                {log.error ? <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{String(log.error)}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
