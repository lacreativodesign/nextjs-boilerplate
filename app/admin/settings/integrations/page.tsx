"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";

type Webhook = {
  name: string;
  url: string;
  enabled: boolean;
};

type IntegrationSettings = {
  firebaseStatus: string;
  storageStatus: string;
  webhooks: Webhook[];
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: IntegrationSettings = {
  firebaseStatus: "Not configured",
  storageStatus: "Not configured",
  webhooks: [],
};

export default function IntegrationSettingsPage() {
  const [settings, setSettings] = useState<IntegrationSettings>(DEFAULT_SETTINGS);
  const [newWebhook, setNewWebhook] = useState<Webhook>({ name: "", url: "", enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/settings/integrations", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have access to integrations.");
        if (res.status === 401) throw new Error("Please sign in again to continue.");
        throw new Error(data?.error || "Unable to load integrations.");
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      console.error("integrations load error", err);
      setError(err.message || "Unable to load integration settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const addWebhook = () => {
    if (!newWebhook.name.trim() && !newWebhook.url.trim()) return;
    setSettings((prev) => ({
      ...prev,
      webhooks: [...prev.webhooks, { ...newWebhook, name: newWebhook.name.trim(), url: newWebhook.url.trim() }],
    }));
    setNewWebhook({ name: "", url: "", enabled: true });
  };

  const updateWebhook = (index: number, updates: Partial<Webhook>) => {
    setSettings((prev) => {
      const next = [...prev.webhooks];
      next[index] = { ...next[index], ...updates };
      return { ...prev, webhooks: next };
    });
  };

  const removeWebhook = (index: number) => {
    setSettings((prev) => ({ ...prev, webhooks: prev.webhooks.filter((_, idx) => idx !== index) }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/settings/integrations", {
        method: "PUT",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have permission to edit integrations.");
        throw new Error(data?.error || "Unable to save settings.");
      }
      setSuccess("Integration settings updated.");
    } catch (err: any) {
      console.error("integrations save error", err);
      setError(err.message || "Unable to save integration settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">Only Super Admins can edit integrations. You have view-only access.</SettingsAlert>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Integrations</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Firebase connection status and outbound webhook configuration.
            </p>
          </div>
          <button className="btn" onClick={handleSave} disabled={disabled} style={{ borderRadius: 999 }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700 }}>Firebase Status</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{settings.firebaseStatus}</div>
          </div>
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700 }}>Storage Status</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{settings.storageStatus}</div>
          </div>
        </div>

        <div className="mt-6">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Webhooks</div>
          {settings.webhooks.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>No webhooks configured.</div>
          )}
          <div className="space-y-3">
            {settings.webhooks.map((webhook, index) => (
              <div key={`${webhook.name}-${index}`} className="card" style={{ padding: 16, borderRadius: 14 }}>
                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    className="input"
                    value={webhook.name}
                    onChange={(e) => updateWebhook(index, { name: e.target.value })}
                    disabled={disabled}
                  />
                  <input
                    className="input"
                    value={webhook.url}
                    onChange={(e) => updateWebhook(index, { url: e.target.value })}
                    disabled={disabled}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={webhook.enabled}
                      onChange={(e) => updateWebhook(index, { enabled: e.target.checked })}
                      disabled={disabled}
                    />
                    <span>Enabled</span>
                  </label>
                </div>
                {!disabled && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => removeWebhook(index)}
                    style={{ marginTop: 12, borderRadius: 999 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 card" style={{ padding: 16, borderRadius: 14 }}>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="input"
                value={newWebhook.name}
                onChange={(e) => setNewWebhook((prev) => ({ ...prev, name: e.target.value }))}
                disabled={disabled}
              />
              <input
                className="input"
                value={newWebhook.url}
                onChange={(e) => setNewWebhook((prev) => ({ ...prev, url: e.target.value }))}
                disabled={disabled}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newWebhook.enabled}
                  onChange={(e) => setNewWebhook((prev) => ({ ...prev, enabled: e.target.checked }))}
                  disabled={disabled}
                />
                <span>Enabled</span>
              </label>
            </div>
            <button className="btn ghost" type="button" onClick={addWebhook} disabled={disabled} style={{ marginTop: 12 }}>
              Add Webhook
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
