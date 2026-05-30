"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorCard } from "../_components/ReportsUI";

type ReportSettings = {
  arAgingBucketsDays: number[];
  keyAccountUsdThreshold: number;
  atRiskAfterDays: number;
  overdueAfterDays: number;
  stageSlaDays: Record<string, number>;
};

const DEFAULT_SETTINGS: ReportSettings = {
  arAgingBucketsDays: [30, 60, 90],
  keyAccountUsdThreshold: 1000,
  atRiskAfterDays: 7,
  overdueAfterDays: 0,
  stageSlaDays: {
    Kickoff: 3,
    Draft: 5,
    Review: 5,
    Revisions: 7,
    Final: 3,
    Delivered: 0,
  },
};

const PIPELINE_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];

export default function ReportsSettingsPage() {
  const [settings, setSettings] = useState<ReportSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/reports/settings", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403) throw new Error("You do not have access to Admin reports.");
        if (res.status === 401) throw new Error("Please sign in again to view reports.");
        throw new Error(json?.error || "Unable to load settings.");
      }
      setSettings(json.settings as ReportSettings);
    } catch (err) {
      console.error("reports settings load error", err);
      setError("Unable to load report settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const bucketInputs = useMemo(() => {
    const values = [...(settings.arAgingBucketsDays || [])];
    while (values.length < 3) values.push(0);
    return values.slice(0, 3);
  }, [settings.arAgingBucketsDays]);

  const updateBucket = (index: number, value: string) => {
    const next = [...bucketInputs];
    next[index] = Number(value);
    setSettings((prev) => ({ ...prev, arAgingBucketsDays: next }));
  };

  const updateStageSla = (stage: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      stageSlaDays: { ...prev.stageSlaDays, [stage]: Number(value) },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/reports/settings", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403) throw new Error("You do not have access to Admin reports.");
        if (res.status === 401) throw new Error("Please sign in again to view reports.");
        throw new Error(json?.error || "Unable to save settings.");
      }
      setSuccess("Settings updated.");
    } catch (err) {
      console.error("reports settings save error", err);
      setError("Unable to save report settings right now.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <ErrorCard message={error} />}
      {success && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: "1px solid rgba(16,185,129,0.35)",
            background: "rgba(209,250,229,0.6)",
            color: "#065f46",
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Report Settings</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Configure global thresholds used across revenue, delivery, and production analytics.
            </p>
          </div>
          <button className="btn" onClick={handleSave} disabled={saving || loading} style={{ borderRadius: 999 }}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>AR Aging Buckets (Days)</div>
            <div className="flex flex-wrap gap-3">
              {bucketInputs.map((value, index) => (
                <input
                  key={`bucket-${index}`}
                  className="input"
                  type="number"
                  min={0}
                  value={Number.isFinite(value) ? value : 0}
                  onChange={(e) => updateBucket(index, e.target.value)}
                  style={{ width: 120 }}
                />
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--sidebar-text)" }}>
              Recommended: {DEFAULT_SETTINGS.arAgingBucketsDays.join(", ")} days.
            </p>
          </div>

          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>Key Account Threshold (USD)</div>
            <div className="card" style={{ padding: 12, borderRadius: 12 }}>
              <div style={{ fontWeight: 700 }}>${settings.keyAccountUsdThreshold}</div>
              <p style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Locked baseline for key accounts.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>At-Risk Warning Days</div>
            <input
              className="input"
              type="number"
              min={0}
              value={settings.atRiskAfterDays}
              onChange={(e) => setSettings((prev) => ({ ...prev, atRiskAfterDays: Number(e.target.value) }))}
              style={{ width: 160 }}
            />
          </div>

          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>Overdue After (Days)</div>
            <input
              className="input"
              type="number"
              min={0}
              value={settings.overdueAfterDays}
              onChange={(e) => setSettings((prev) => ({ ...prev, overdueAfterDays: Number(e.target.value) }))}
              style={{ width: 160 }}
            />
            <p style={{ fontSize: 12, color: "var(--sidebar-text)" }}>0 keeps the previous behavior (overdue on due date).</p>
          </div>

          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>Stage SLA Days</div>
            <div className="grid gap-3 md:grid-cols-2">
              {PIPELINE_STAGES.map((stage) => (
                <label key={stage} className="space-y-1">
                  <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>{stage}</div>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={settings.stageSlaDays?.[stage] ?? 0}
                    onChange={(e) => updateStageSla(stage, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
