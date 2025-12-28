"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "./_components/SettingsAlert";

const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type SystemSettings = {
  companyName: string;
  timezone: string;
  dateFormat: string;
  workingDays: string[];
  workingHours: { start: string; end: string };
  revenueCurrency: string;
  expenseCurrency: string;
  fiscalMonthStart: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: SystemSettings = {
  companyName: "",
  timezone: "",
  dateFormat: "",
  workingDays: [],
  workingHours: { start: "", end: "" },
  revenueCurrency: "USD",
  expenseCurrency: "PKR",
  fiscalMonthStart: 1,
};

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/settings/system", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have access to system settings.");
        if (res.status === 401) throw new Error("Please sign in again to continue.");
        throw new Error(data?.error || "Unable to load settings.");
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      console.error("system settings load error", err);
      setError(err.message || "Unable to load system settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const toggleDay = (day: string) => {
    setSettings((prev) => {
      const active = new Set(prev.workingDays || []);
      if (active.has(day)) active.delete(day);
      else active.add(day);
      return { ...prev, workingDays: Array.from(active) };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/settings/system", {
        method: "PUT",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have permission to edit system settings.");
        throw new Error(data?.error || "Unable to save settings.");
      }
      setSuccess("System settings updated.");
    } catch (err: any) {
      console.error("system settings save error", err);
      setError(err.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone=\"error\">{error}</SettingsAlert>}
      {success && <SettingsAlert tone=\"success\">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">
          <div style={{ fontWeight: 700 }}>Read-only access</div>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Only Super Admins can edit these settings. Contact your administrator for changes.
          </p>
        </SettingsAlert>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>General System Settings</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Global company defaults used across the ERP.
            </p>
          </div>
          <button className="btn" onClick={handleSave} disabled={disabled} style={{ borderRadius: 999 }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Company Name</span>
            <input
              className="input"
              value={settings.companyName}
              onChange={(e) => setSettings((prev) => ({ ...prev, companyName: e.target.value }))}
              disabled={disabled}
            />
          </label>

          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Timezone</span>
            <input
              className="input"
              value={settings.timezone}
              onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
              disabled={disabled}
            />
          </label>

          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Date Format</span>
            <input
              className="input"
              value={settings.dateFormat}
              onChange={(e) => setSettings((prev) => ({ ...prev, dateFormat: e.target.value }))}
              disabled={disabled}
            />
          </label>

          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Fiscal Month Start (1-12)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={12}
              value={settings.fiscalMonthStart}
              onChange={(e) => setSettings((prev) => ({ ...prev, fiscalMonthStart: Number(e.target.value) }))}
              disabled={disabled}
            />
          </label>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div style={{ fontSize: 13, fontWeight: 600 }}>Working Days</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORKING_DAYS.map((day) => {
                const active = settings.workingDays.includes(day);
                return (
                  <label key={day} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleDay(day)}
                      disabled={disabled}
                    />
                    <span>{day}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div style={{ fontSize: 13, fontWeight: 600 }}>Working Hours</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Start</span>
                <input
                  className="input"
                  type="time"
                  value={settings.workingHours.start}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      workingHours: { ...prev.workingHours, start: e.target.value },
                    }))
                  }
                  disabled={disabled}
                />
              </label>
              <label className="space-y-1">
                <span style={{ fontSize: 12, color: "var(--sidebar-text)" }}>End</span>
                <input
                  className="input"
                  type="time"
                  value={settings.workingHours.end}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      workingHours: { ...prev.workingHours, end: e.target.value },
                    }))
                  }
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Revenue Currency</div>
            <div style={{ fontSize: 14 }}>USD (locked)</div>
          </div>
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Expense Currency</div>
            <div style={{ fontSize: 14 }}>PKR (locked)</div>
          </div>
        </div>
      </section>
    </div>
  );
}
