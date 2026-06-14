"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsAlert } from "../../_components/SettingsAlert";
import { apiFetch } from "@/lib/api/client";

type Audience = { id: string; name: string; memberCount: number };

type Connection = {
  connected: boolean;
  accountName: string | null;
  accountEmail: string | null;
  dc: string | null;
  settings?: {
    autoSyncEnabled: boolean;
    defaultAudienceId: string | null;
    tagMapping: Record<string, string[]>;
  };
  stats?: {
    lastSyncFinishedAt: string | null;
    lastSyncStatus: "idle" | "running" | "success" | "error";
    lastSyncError: string | null;
    lastSyncedCount: number;
    lastUnsubscribedCount: number;
  };
};

export default function MailchimpIntegrationPage() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [segmentType, setSegmentType] = useState("");
  const [segmentStatus, setSegmentStatus] = useState("");
  const [segmentTags, setSegmentTags] = useState("");
  const [tagMappingText, setTagMappingText] = useState("{}");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/integrations/mailchimp/audiences", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to load Mailchimp state.");
      setConnection(data.connection || null);
      setAudiences(data.audiences || []);
      setTagMappingText(JSON.stringify(data.connection?.settings?.tagMapping || {}, null, 2));
    } catch (err: any) {
      setError(err.message || "Unable to load Mailchimp integration state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOauth = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/integrations/mailchimp/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true, returnTo: "/admin/settings/integrations/mailchimp" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.authorizeUrl) throw new Error(data?.error || "Unable to start Mailchimp OAuth.");
      window.location.href = data.authorizeUrl;
    } catch (err: any) {
      setError(err.message || "Unable to connect Mailchimp.");
      setSaving(false);
    }
  };

  const saveApiKey = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/integrations/mailchimp/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to save API key.");
      setSuccess("Mailchimp API key saved.");
      setApiKey("");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to save API key.");
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      const parsed = JSON.parse(tagMappingText || "{}");
      const res = await apiFetch("/api/integrations/mailchimp/audiences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSyncEnabled: Boolean(connection?.settings?.autoSyncEnabled),
          defaultAudienceId: connection?.settings?.defaultAudienceId || null,
          tagMapping: parsed,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to save settings.");
      setSuccess("Mailchimp sync settings saved.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to save settings. Tag mapping must be valid JSON.");
    } finally {
      setSaving(false);
    }
  };

  const runSync = async (mode: "one_time" | "segment") => {
    try {
      setSaving(true);
      setError(null);
      const filter =
        mode === "segment"
          ? {
              type: segmentType || undefined,
              status: segmentStatus || undefined,
              tags: segmentTags
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : undefined;

      const res = await apiFetch("/api/integrations/mailchimp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          audienceId: connection?.settings?.defaultAudienceId || undefined,
          filter,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Sync failed.");
      setSuccess(
        `Sync complete. Synced ${data.result?.synced || 0} clients; unsubscribed respected for ${data.result?.unsubscribed || 0} clients.`
      );
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to run sync.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Mailchimp Email Marketing Sync</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>OAuth/API key connection, audience mapping, auto-sync, and segment sync.</p>
          </div>
          <button className="btn subtle" type="button" onClick={startOauth} disabled={saving || loading}>
            {connection?.connected ? "Reconnect Mailchimp" : "Connect Mailchimp"}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Status</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{connection?.connected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>{connection?.accountName || connection?.accountEmail || "No Mailchimp account linked"}</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>Data Center: {connection?.dc || "-"}</div>
          </div>
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <label className="block text-sm">Mailchimp API Key</label>
            <input className="input mt-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="xxxxxxxx-us1" type="password" />
            <button className="btn ghost mt-3" type="button" disabled={saving || !apiKey.trim()} onClick={saveApiKey}>
              Save API Key
            </button>
          </div>
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Audience Selector & Sync Settings</div>
        <div className="settings-divider" />

        <label className="block text-sm">Default Audience</label>
        <select
          className="input mt-2"
          value={connection?.settings?.defaultAudienceId || ""}
          onChange={(e) =>
            setConnection((prev) =>
              prev
                ? {
                    ...prev,
                    settings: {
                      autoSyncEnabled: prev.settings?.autoSyncEnabled || false,
                      tagMapping: prev.settings?.tagMapping || {},
                      defaultAudienceId: e.target.value || null,
                    },
                  }
                : prev
            )
          }
          disabled={loading || saving || !connection?.connected}
        >
          <option value="">Select audience</option>
          {audiences.map((aud) => (
            <option key={aud.id} value={aud.id}>
              {aud.name} ({aud.memberCount})
            </option>
          ))}
        </select>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(connection?.settings?.autoSyncEnabled)}
            disabled={loading || saving || !connection?.connected}
            onChange={(e) =>
              setConnection((prev) =>
                prev
                  ? {
                      ...prev,
                      settings: {
                        autoSyncEnabled: e.target.checked,
                        defaultAudienceId: prev.settings?.defaultAudienceId || null,
                        tagMapping: prev.settings?.tagMapping || {},
                      },
                    }
                  : prev
              )
            }
          />
          <span>Enable auto-sync for newly created clients</span>
        </label>

        <label className="block text-sm mt-3">Tag Mapping (JSON: Bizosto tag → Mailchimp tags[])</label>
        <textarea className="input mt-2" rows={8} value={tagMappingText} onChange={(e) => setTagMappingText(e.target.value)} />

        <button className="btn ghost mt-3" type="button" disabled={saving || loading || !connection?.connected} onClick={saveSettings}>
          Save Sync Settings
        </button>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Sync Controls</div>
        <div className="settings-divider" />

        <div className="flex flex-wrap gap-2">
          <button className="btn subtle" type="button" onClick={() => runSync("one_time")} disabled={saving || loading || !connection?.connected}>
            One-time Sync (All Clients)
          </button>
          <button className="btn ghost" type="button" onClick={() => runSync("segment")} disabled={saving || loading || !connection?.connected}>
            Segment Sync
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <input className="input" placeholder="Segment type (customer/lead)" value={segmentType} onChange={(e) => setSegmentType(e.target.value)} />
          <input className="input" placeholder="Segment status (new/won)" value={segmentStatus} onChange={(e) => setSegmentStatus(e.target.value)} />
          <input className="input" placeholder="Segment tags comma-separated" value={segmentTags} onChange={(e) => setSegmentTags(e.target.value)} />
        </div>

        <div className="card mt-3" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Last Sync Status</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{connection?.stats?.lastSyncStatus || "idle"}</div>
          <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>
            Last finished: {connection?.stats?.lastSyncFinishedAt || "-"}
          </div>
          <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>
            Last synced contacts: {connection?.stats?.lastSyncedCount || 0}; unsubscribed respected: {connection?.stats?.lastUnsubscribedCount || 0}
          </div>
          {connection?.stats?.lastSyncError ? (
            <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{connection.stats.lastSyncError}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
