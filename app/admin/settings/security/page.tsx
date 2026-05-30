"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";

type SecuritySettings = {
  sessionTimeoutMinutes: number;
  passwordPolicy: string;
  activityRetentionDays: number;
  forceLogoutAll: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: SecuritySettings = {
  sessionTimeoutMinutes: 60,
  passwordPolicy: "Minimum 8 characters, 1 uppercase letter, 1 number.",
  activityRetentionDays: 90,
  forceLogoutAll: false,
};

export default function SecuritySettingsPage() {
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/settings/security", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have access to security settings.");
        if (res.status === 401) throw new Error("Please sign in again to continue.");
        throw new Error(data?.error || "Unable to load settings.");
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err) {
      console.error("security settings load error", err);
      setError((err as Record<string, unknown>).message || "Unable to load security settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/settings/security", {
        method: "PUT",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have permission to edit security settings.");
        throw new Error(data?.error || "Unable to save settings.");
      }
      setSuccess("Security settings updated.");
    } catch (err) {
      console.error("security settings save error", err);
      setError((err as Record<string, unknown>).message || "Unable to save security settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">Only Super Admins can edit security settings. You have view-only access.</SettingsAlert>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Security & Sessions</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Session controls, password policies, and audit retention.
            </p>
          </div>
          <button className="btn" onClick={handleSave} disabled={disabled} style={{ borderRadius: 999 }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Session Timeout (Minutes)</span>
            <input
              className="input"
              type="number"
              min={5}
              value={settings.sessionTimeoutMinutes}
              onChange={(e) => setSettings((prev) => ({ ...prev, sessionTimeoutMinutes: Number(e.target.value) }))}
              disabled={disabled}
            />
          </label>

          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Activity Retention (Days)</span>
            <input
              className="input"
              type="number"
              min={1}
              value={settings.activityRetentionDays}
              onChange={(e) => setSettings((prev) => ({ ...prev, activityRetentionDays: Number(e.target.value) }))}
              disabled={disabled}
            />
          </label>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Password Policy</div>
            <div style={{ fontSize: 14, color: "var(--sidebar-text)" }}>{settings.passwordPolicy}</div>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span style={{ fontWeight: 600 }}>Force logout all sessions</span>
              <input
                type="checkbox"
                checked={settings.forceLogoutAll}
                onChange={(e) => setSettings((prev) => ({ ...prev, forceLogoutAll: e.target.checked }))}
                disabled={disabled}
              />
            </label>
            <p style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 6 }}>
              Stub: toggling logs the request for enforcement by Functions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
