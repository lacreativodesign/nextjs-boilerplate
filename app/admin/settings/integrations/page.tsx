"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/types";
import { apiFetch } from "@/lib/api/client";

type Webhook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: "active" | "disabled";
  description: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  responseStatus: number | null;
  responseBody: string | null;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: string;
  errorMessage: string | null;
};

type Health = {
  subscriptionId: string;
  healthy: boolean;
};

type GoogleConnection = {
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  calendarSyncEnabled: boolean;
  gmailEnabled: boolean;
  driveFolderId: string | null;
};

type SlackConnection = {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  scopes: string[];
  defaultChannelId: string | null;
  channelMappings: { invoicePaid: string | null; projectMilestone: string | null };
  notifyTaskAssignedDm: boolean;
  notifyLeaveApprovedDm: boolean;
  commandEnabled: boolean;
  notificationEnabled: boolean;
};

type MicrosoftConnection = {
  connected: boolean;
  accountEmail: string | null;
  accountDisplayName: string | null;
  microsoftTenantId: string | null;
  scopes: string[];
  calendarSyncEnabled: boolean;
  outlookEmailEnabled: boolean;
  oneDriveRootFolderId: string | null;
  oneDriveRootFolderName: string | null;
};

export default function IntegrationSettingsPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null);
  const [slackConnection, setSlackConnection] = useState<SlackConnection | null>(null);
  const [microsoftConnection, setMicrosoftConnection] = useState<MicrosoftConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newWebhook, setNewWebhook] = useState({
    url: "",
    events: ["invoice.created"],
    secret: "",
    status: "active" as const,
    description: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Webhooks are required — if these fail it is a real error
      const [subRes, deliveryRes] = await Promise.all([
        apiFetch("/api/webhooks/subscriptions", { cache: "no-store" }),
        apiFetch("/api/webhooks/deliveries?limit=100", { cache: "no-store" }),
      ]);

      const subData = await subRes.json();
      const deliveryData = await deliveryRes.json();

      if (!subRes.ok || !subData?.ok) throw new Error(subData?.error || "Unable to load webhooks.");
      if (!deliveryRes.ok || !deliveryData?.ok) throw new Error(deliveryData?.error || "Unable to load deliveries.");

      setWebhooks(subData.subscriptions || []);
      setHealth(subData.health || []);
      setDeliveries(deliveryData.deliveries || []);

      // Integration connections are optional — handle each independently
      // A 500 or error just means "not connected yet", never crash the page
      const safeJson = async (res: Response) => {
        try { return await res.json(); } catch { return null; }
      };

      const [googleRes, slackRes, microsoftRes] = await Promise.allSettled([
        apiFetch("/api/integrations/google/connection", { cache: "no-store" }),
        apiFetch("/api/integrations/slack/connection", { cache: "no-store" }),
        apiFetch("/api/integrations/microsoft/connection", { cache: "no-store" }),
      ]);

      if (googleRes.status === "fulfilled") {
        const googleData = await safeJson(googleRes.value);
        setGoogleConnection(googleData?.ok ? (googleData.connection ?? null) : null);
      }

      if (slackRes.status === "fulfilled") {
        const slackData = await safeJson(slackRes.value);
        setSlackConnection(slackData?.ok ? (slackData.connection ?? null) : null);
      }

      if (microsoftRes.status === "fulfilled") {
        const microsoftData = await safeJson(microsoftRes.value);
        setMicrosoftConnection(microsoftData?.ok ? (microsoftData.connection ?? null) : null);
      }

    } catch (err: any) {
      setError(err.message || "Unable to load integration settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (event: string) => {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((item) => item !== event) : [...prev.events, event],
    }));
  };

  const createWebhook = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/webhooks/subscriptions", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWebhook),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to create webhook.");
      setSuccess("Webhook subscription created.");
      setNewWebhook({ url: "", events: ["invoice.created"], secret: "", status: "active", description: "" });
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to create webhook.");
    } finally {
      setSaving(false);
    }
  };

  const removeWebhook = async (id: string) => {
    try {
      const res = await apiFetch(`/api/webhooks/subscriptions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to delete webhook.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to delete webhook.");
    }
  };

  const testWebhook = async (id: string) => {
    try {
      const res = await apiFetch(`/api/webhooks/subscriptions/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to send test event.");
      setSuccess(`Test sent. Deliveries created: ${data.deliveriesCreated}.`);
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to send test event.");
    }
  };

  const retryDelivery = async (id: string) => {
    try {
      const res = await apiFetch(`/api/webhooks/deliveries/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to retry delivery.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to retry delivery.");
    }
  };

  const connectGoogleWorkspace = () => {
    window.location.href = "/api/integrations/google/authorize?returnTo=/admin/settings/integrations";
  };

  const connectSlackWorkspace = async () => {
    try {
      setSaving(true);
      const res = await apiFetch("/api/integrations/slack/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true, returnTo: "/admin/settings/integrations" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.installUrl) throw new Error(data?.error || "Unable to start Slack OAuth.");
      window.location.href = data.installUrl;
    } catch (err: any) {
      setError(err.message || "Unable to connect Slack.");
      setSaving(false);
    }
  };

  const connectMicrosoft365 = () => {
    window.location.href = "/api/integrations/microsoft/authorize?returnTo=/admin/settings/integrations";
  };

  const updateSlackConnection = async (patch: Partial<SlackConnection>) => {
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/integrations/slack/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to update Slack settings.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to update Slack settings.");
    } finally {
      setSaving(false);
    }
  };

  const updateGoogleConnection = async (patch: Partial<GoogleConnection>) => {
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/integrations/google/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to update Google Workspace settings.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to update Google Workspace settings.");
    } finally {
      setSaving(false);
    }
  };

  const updateMicrosoftConnection = async (patch: Partial<MicrosoftConnection>) => {
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/integrations/microsoft/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to update Microsoft settings.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to update Microsoft settings.");
    } finally {
      setSaving(false);
    }
  };

  const healthMap = useMemo(() => new Map(health.map((item) => [item.subscriptionId, item.healthy])), [health]);

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>QuickBooks Online</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Manage OAuth connection, sync settings, conflict mode, and accounting sync logs.</p>
          </div>
          <a className="btn subtle" href="/admin/settings/integrations/quickbooks">
            Open QuickBooks Sync
          </a>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Xero</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Manage OAuth connection, sync settings, conflict mode, and accounting sync logs.</p>
          </div>
          <a className="btn subtle" href="/admin/settings/integrations/xero">
            Open Xero Sync
          </a>
        </div>
      </section>


      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Mailchimp</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Audience sync for CRM clients, tag mapping, segment sync, and unsubscribe-safe automation.</p>
          </div>
          <a className="btn subtle" href="/admin/settings/integrations/mailchimp">
            Open Mailchimp Sync
          </a>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>DocuSign</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>OAuth connection, signature workflow, status tracking, and signed document download.</p>
          </div>
          <a className="btn subtle" href="/admin/settings/integrations/docusign">
            Open DocuSign E-Signature
          </a>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Twilio SMS</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Configure account routing, SMS templates, trigger controls, delivery tracking, and opt-out handling.</p>
          </div>
          <a className="btn subtle" href="/admin/settings/integrations/twilio">
            Open Twilio SMS Setup
          </a>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Microsoft 365</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>OAuth consent, Outlook calendar sync, OneDrive storage, and Outlook email delivery.</p>
          </div>
          <button className="btn subtle" type="button" onClick={connectMicrosoft365} disabled={saving || loading}>
            {microsoftConnection?.connected ? "Reconnect Microsoft 365" : "Connect Microsoft 365"}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Status</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{microsoftConnection?.connected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>{microsoftConnection?.accountDisplayName || microsoftConnection?.accountEmail || "No Microsoft account linked"}</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>Tenant ID: {microsoftConnection?.microsoftTenantId || "-"}</div>
          </div>
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <label className="flex items-center justify-between text-sm">
              <span>Outlook calendar sync enabled</span>
              <input
                type="checkbox"
                checked={Boolean(microsoftConnection?.calendarSyncEnabled)}
                disabled={!microsoftConnection?.connected || saving || loading}
                onChange={(e) => updateMicrosoftConnection({ calendarSyncEnabled: e.target.checked })}
              />
            </label>
            <label className="mt-3 flex items-center justify-between text-sm">
              <span>Outlook email enabled</span>
              <input
                type="checkbox"
                checked={Boolean(microsoftConnection?.outlookEmailEnabled)}
                disabled={!microsoftConnection?.connected || saving || loading}
                onChange={(e) => updateMicrosoftConnection({ outlookEmailEnabled: e.target.checked })}
              />
            </label>
            <input
              className="input mt-3"
              value={microsoftConnection?.oneDriveRootFolderId || ""}
              placeholder="OneDrive root folder ID"
              disabled={!microsoftConnection?.connected || saving || loading}
              onChange={(e) => setMicrosoftConnection((prev) => (prev ? { ...prev, oneDriveRootFolderId: e.target.value } : prev))}
            />
            <input
              className="input mt-3"
              value={microsoftConnection?.oneDriveRootFolderName || ""}
              placeholder="OneDrive folder name"
              disabled={!microsoftConnection?.connected || saving || loading}
              onChange={(e) => setMicrosoftConnection((prev) => (prev ? { ...prev, oneDriveRootFolderName: e.target.value } : prev))}
            />
            <button
              className="btn ghost mt-3"
              type="button"
              disabled={!microsoftConnection?.connected || saving || loading}
              onClick={() =>
                updateMicrosoftConnection({
                  oneDriveRootFolderId: microsoftConnection?.oneDriveRootFolderId || null,
                  oneDriveRootFolderName: microsoftConnection?.oneDriveRootFolderName || null,
                })
              }
            >
              Save OneDrive Folder
            </button>
          </div>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Google Workspace</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>OAuth consent, Calendar sync, Drive storage, and Gmail sending.</p>
          </div>
          <button className="btn subtle" type="button" onClick={connectGoogleWorkspace} disabled={saving || loading}>
            {googleConnection?.connected ? "Reconnect Google" : "Connect Google"}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Status</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{googleConnection?.connected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>{googleConnection?.accountEmail || "No Google account linked"}</div>
          </div>
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <label className="flex items-center justify-between text-sm">
              <span>Calendar sync enabled</span>
              <input
                type="checkbox"
                checked={Boolean(googleConnection?.calendarSyncEnabled)}
                disabled={!googleConnection?.connected || saving || loading}
                onChange={(e) => updateGoogleConnection({ calendarSyncEnabled: e.target.checked })}
              />
            </label>
            <label className="mt-3 flex items-center justify-between text-sm">
              <span>Gmail sending enabled</span>
              <input
                type="checkbox"
                checked={Boolean(googleConnection?.gmailEnabled)}
                disabled={!googleConnection?.connected || saving || loading}
                onChange={(e) => updateGoogleConnection({ gmailEnabled: e.target.checked })}
              />
            </label>
            <input
              className="input mt-3"
              value={googleConnection?.driveFolderId || ""}
              placeholder="Drive folder ID for Bizosto files"
              disabled={!googleConnection?.connected || saving || loading}
              onChange={(e) => setGoogleConnection((prev) => (prev ? { ...prev, driveFolderId: e.target.value } : prev))}
            />
            <button
              className="btn ghost mt-3"
              type="button"
              disabled={!googleConnection?.connected || saving || loading}
              onClick={() => updateGoogleConnection({ driveFolderId: googleConnection?.driveFolderId || null })}
            >
              Save Drive Folder
            </button>
          </div>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Slack</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Workspace integration, channel mappings, notifications, and /bizosto slash commands.</p>
          </div>
          <button className="btn subtle" type="button" onClick={connectSlackWorkspace} disabled={saving || loading}>
            {slackConnection?.connected ? "Reconnect Slack" : "Connect Slack"}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Status</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{slackConnection?.connected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>{slackConnection?.teamName || "No Slack workspace linked"}</div>
            <input
              className="input mt-3"
              value={slackConnection?.defaultChannelId || ""}
              placeholder="Default channel ID (e.g. C012345)"
              disabled={!slackConnection?.connected || saving || loading}
              onChange={(e) => setSlackConnection((prev) => (prev ? { ...prev, defaultChannelId: e.target.value } : prev))}
            />
            <button className="btn ghost mt-3" type="button" disabled={!slackConnection?.connected || saving || loading} onClick={() => updateSlackConnection({ defaultChannelId: slackConnection?.defaultChannelId || null })}>
              Save Default Channel
            </button>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <input
              className="input"
              value={slackConnection?.channelMappings?.invoicePaid || ""}
              placeholder="Invoice paid channel ID (#finance)"
              disabled={!slackConnection?.connected || saving || loading}
              onChange={(e) =>
                setSlackConnection((prev) =>
                  prev ? { ...prev, channelMappings: { ...prev.channelMappings, invoicePaid: e.target.value } } : prev
                )
              }
            />
            <input
              className="input mt-3"
              value={slackConnection?.channelMappings?.projectMilestone || ""}
              placeholder="Project milestone channel ID (#projects)"
              disabled={!slackConnection?.connected || saving || loading}
              onChange={(e) =>
                setSlackConnection((prev) =>
                  prev ? { ...prev, channelMappings: { ...prev.channelMappings, projectMilestone: e.target.value } } : prev
                )
              }
            />
            <button
              className="btn ghost mt-3"
              type="button"
              disabled={!slackConnection?.connected || saving || loading}
              onClick={() => updateSlackConnection({ channelMappings: slackConnection?.channelMappings || { invoicePaid: null, projectMilestone: null } })}
            >
              Save Channel Mapping
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 mt-3">
          <label className="flex items-center justify-between text-sm">
            <span>Task assigned DM</span>
            <input type="checkbox" checked={Boolean(slackConnection?.notifyTaskAssignedDm)} disabled={!slackConnection?.connected || saving || loading} onChange={(e) => updateSlackConnection({ notifyTaskAssignedDm: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Leave approved DM</span>
            <input type="checkbox" checked={Boolean(slackConnection?.notifyLeaveApprovedDm)} disabled={!slackConnection?.connected || saving || loading} onChange={(e) => updateSlackConnection({ notifyLeaveApprovedDm: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Slash commands enabled</span>
            <input type="checkbox" checked={Boolean(slackConnection?.commandEnabled)} disabled={!slackConnection?.connected || saving || loading} onChange={(e) => updateSlackConnection({ commandEnabled: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Slack notifications enabled</span>
            <input type="checkbox" checked={Boolean(slackConnection?.notificationEnabled)} disabled={!slackConnection?.connected || saving || loading} onChange={(e) => updateSlackConnection({ notificationEnabled: e.target.checked })} />
          </label>
        </div>

        <div className="card mt-3" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Slash command help</div>
<code style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{`/bizosto task create project=<projectId> title="Quarterly review" priority=high assigned=<userId>\n/bizosto invoice status INV-1001\n/bizosto leave request type=vacation start=2026-02-01 end=2026-02-03 reason="Family trip"\n/bizosto project status\n/bizosto help`}</code>        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Webhook Subscriptions</div>
        <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Configure outbound real-time events for external integrations.</p>

        <div className="settings-divider" />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="https://hooks.zapier.com/..."
              value={newWebhook.url}
              onChange={(e) => setNewWebhook((prev) => ({ ...prev, url: e.target.value }))}
              disabled={saving || loading}
            />
            <input
              className="input"
              placeholder="Secret (optional)"
              value={newWebhook.secret}
              onChange={(e) => setNewWebhook((prev) => ({ ...prev, secret: e.target.value }))}
              disabled={saving || loading}
            />
          </div>
          <input
            className="input mt-3"
            placeholder="Description (optional)"
            value={newWebhook.description}
            onChange={(e) => setNewWebhook((prev) => ({ ...prev, description: e.target.value }))}
            disabled={saving || loading}
          />
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {WEBHOOK_EVENT_TYPES.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newWebhook.events.includes(event)} onChange={() => toggleEvent(event)} />
                <span>{event}</span>
              </label>
            ))}
          </div>
          <button className="btn subtle mt-4" type="button" onClick={createWebhook} disabled={saving || loading || !newWebhook.url.trim()}>
            {saving ? "Creating..." : "Create Webhook"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {loading && <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Loading...</div>}
          {!loading && webhooks.length === 0 && <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>No webhooks configured.</div>}
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div style={{ fontWeight: 700 }}>{webhook.url}</div>
                <div style={{ fontSize: 12 }}>{healthMap.get(webhook.id) ? "Healthy" : "Degraded"}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 8 }}>
                {webhook.events.join(", ")} · failures: {webhook.consecutiveFailures}
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn ghost" type="button" onClick={() => testWebhook(webhook.id)}>
                  Send Test
                </button>
                <button className="btn ghost" type="button" onClick={() => removeWebhook(webhook.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Delivery History</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ opacity: 0.7 }}>
                <th className="pb-2">Event</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Response</th>
                <th className="pb-2">Retries</th>
                <th className="pb-2">Payload</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-t border-white/10 align-top">
                  <td className="py-2">{delivery.eventType}</td>
                  <td className="py-2">{delivery.status}</td>
                  <td className="py-2">{delivery.responseStatus ?? "-"}</td>
                  <td className="py-2">{delivery.retryCount}</td>
                  <td className="py-2">
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(delivery.payload, null, 2)}</pre>
                  </td>
                  <td className="py-2">
                    {(delivery.status === "failed" || delivery.status === "retrying") && (
                      <button className="btn ghost" type="button" onClick={() => retryDelivery(delivery.id)}>
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
