"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";
import { apiFetch } from "@/lib/api/client";

type FinanceSettings = {
  invoicePrefix: string;
  invoiceCounter: number;
  paymentMethods: string[];
  arBuckets: number[];
  payrollApprovalRequired: boolean;
  lockPastMonths: boolean;
  fxPkrPerUsd: number;
  lateFeesSettings: {
    enabled: boolean;
    type: "percentage" | "fixed";
    value: number;
    gracePeriodDays: number;
  };
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: FinanceSettings = {
  invoicePrefix: "",
  invoiceCounter: 0,
  paymentMethods: [],
  arBuckets: [30, 60, 90],
  payrollApprovalRequired: false,
  lockPastMonths: false,
  fxPkrPerUsd: 280,
  lateFeesSettings: {
    enabled: true,
    type: "percentage",
    value: 5,
    gracePeriodDays: 3,
  },
};

export default function FinanceSettingsPage() {
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS);
  const [methodInput, setMethodInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await apiFetch("/api/admin/settings/finance", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have access to finance settings.");
        if (res.status === 401) throw new Error("Please sign in again to continue.");
        throw new Error(data?.error || "Unable to load settings.");
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      console.error("finance settings load error", err);
      setError(err.message || "Unable to load finance settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const addMethod = () => {
    const trimmed = methodInput.trim();
    if (!trimmed) return;
    setSettings((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(trimmed) ? prev.paymentMethods : [...prev.paymentMethods, trimmed],
    }));
    setMethodInput("");
  };

  const removeMethod = (method: string) => {
    setSettings((prev) => ({ ...prev, paymentMethods: prev.paymentMethods.filter((item) => item !== method) }));
  };

  const updateBucket = (index: number, value: string) => {
    setSettings((prev) => {
      const next = [...prev.arBuckets];
      next[index] = Number(value);
      return { ...prev, arBuckets: next };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await apiFetch("/api/admin/settings/finance", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have permission to edit finance settings.");
        throw new Error(data?.error || "Unable to save settings.");
      }
      setSuccess("Finance settings updated.");
    } catch (err: any) {
      console.error("finance settings save error", err);
      setError(err.message || "Unable to save finance settings.");
    } finally {
      setSaving(false);
    }
  };

  const arBuckets = useMemo(() => {
    const values = [...settings.arBuckets];
    while (values.length < 3) values.push(0);
    return values.slice(0, 3);
  }, [settings.arBuckets]);

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">Admins and Super Admins can edit finance settings. You have view-only access.</SettingsAlert>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Finance Controls</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Invoice numbering, payment methods, AR buckets, and approvals.
            </p>
          </div>
          <button className="btn" onClick={handleSave} disabled={disabled} style={{ borderRadius: 999 }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Invoice Prefix</span>
            <input
              className="input"
              value={settings.invoicePrefix}
              onChange={(e) => setSettings((prev) => ({ ...prev, invoicePrefix: e.target.value }))}
              disabled={disabled}
            />
          </label>

          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Invoice Counter</span>
            <input
              className="input"
              type="number"
              min={0}
              value={settings.invoiceCounter}
              onChange={(e) => setSettings((prev) => ({ ...prev, invoiceCounter: Number(e.target.value) }))}
              disabled={disabled}
            />
          </label>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>FX Rate (PKR per 1 USD)</span>
            <input
              className="input"
              type="number"
              min={1}
              value={settings.fxPkrPerUsd}
              onChange={(e) => setSettings((prev) => ({ ...prev, fxPkrPerUsd: Number(e.target.value) }))}
              disabled={disabled}
              style={{ appearance: "textfield" }}
            />
            <span className="text-xs text-[var(--text-muted)]">
              Used to normalize PKR expenses into USD for Profit reporting.
            </span>
          </label>

          <div className="space-y-2">
            <div style={{ fontWeight: 700 }}>Payment Methods</div>
            <div className="flex flex-wrap gap-2">
              {settings.paymentMethods.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>No payment methods configured.</div>
              )}
              {settings.paymentMethods.map((method) => (
                <span key={method} className="card" style={{ padding: "6px 10px", borderRadius: 999 }}>
                  {method}
                  {!disabled && (
                    <button
                      className="btn ghost"
                      style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999 }}
                      onClick={() => removeMethod(method)}
                    >
                      Remove
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className="input"
                value={methodInput}
                onChange={(e) => setMethodInput(e.target.value)}
                disabled={disabled}
              />
              <button className="btn ghost" type="button" onClick={addMethod} disabled={disabled} style={{ borderRadius: 999 }}>
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div style={{ fontWeight: 700 }}>AR Aging Buckets (Days)</div>
            <div className="flex flex-wrap gap-3">
              {arBuckets.map((value, index) => (
                <input
                  key={`bucket-${index}`}
                  className="input"
                  type="number"
                  min={0}
                  value={Number.isFinite(value) ? value : 0}
                  onChange={(e) => updateBucket(index, e.target.value)}
                  style={{ width: 120 }}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.payrollApprovalRequired}
              onChange={(e) => setSettings((prev) => ({ ...prev, payrollApprovalRequired: e.target.checked }))}
              disabled={disabled}
            />
            <span>Payroll approval required</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.lockPastMonths}
              onChange={(e) => setSettings((prev) => ({ ...prev, lockPastMonths: e.target.checked }))}
              disabled={disabled}
            />
            <span>Lock edits for past months</span>
          </label>
        </div>

        <div className="mt-8 border-t border-[var(--line)] pt-6">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Late Fee Configuration</div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Automatically apply late fees and drive overdue invoice recovery.
          </p>

          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.lateFeesSettings.enabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    lateFeesSettings: { ...prev.lateFeesSettings, enabled: e.target.checked },
                  }))
                }
                disabled={disabled}
              />
              <span>Enable Late Fees</span>
            </label>
          </div>

          {settings.lateFeesSettings.enabled && (
            <div className="mt-4 grid gap-6 lg:grid-cols-3">
              <label className="space-y-2">
                <span style={{ fontSize: 13, fontWeight: 600 }}>Late Fee Type</span>
                <select
                  className="input"
                  value={settings.lateFeesSettings.type}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lateFeesSettings: {
                        ...prev.lateFeesSettings,
                        type: e.target.value === "fixed" ? "fixed" : "percentage",
                      },
                    }))
                  }
                  disabled={disabled}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </label>

              <label className="space-y-2">
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Late Fee {settings.lateFeesSettings.type === "percentage" ? "Percentage" : "Amount (USD)"}
                </span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={settings.lateFeesSettings.value}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lateFeesSettings: {
                        ...prev.lateFeesSettings,
                        value: Number(e.target.value),
                      },
                    }))
                  }
                  disabled={disabled}
                />
              </label>

              <label className="space-y-2">
                <span style={{ fontSize: 13, fontWeight: 600 }}>Grace Period (days)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={settings.lateFeesSettings.gracePeriodDays}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lateFeesSettings: {
                        ...prev.lateFeesSettings,
                        gracePeriodDays: Number(e.target.value),
                      },
                    }))
                  }
                  disabled={disabled}
                />
              </label>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
