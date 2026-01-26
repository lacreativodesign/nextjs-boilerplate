"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";

type SalesSettings = {
  pipelineStages: string[];
  leadSources: string[];
  campaignTags: string[];
  discountApprovalThresholdPct: number;
  closedWonAutomations: {
    createClient: boolean;
    createProject: boolean;
    generateInvoice: boolean;
    triggerEmails: boolean;
  };
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: SalesSettings = {
  pipelineStages: [
    "New Lead",
    "Contacted",
    "Qualified",
    "Proposal Sent",
    "Negotiation",
    "Closed Won",
    "Closed Lost",
  ],
  leadSources: [],
  campaignTags: [],
  discountApprovalThresholdPct: 0,
  closedWonAutomations: {
    createClient: false,
    createProject: false,
    generateInvoice: false,
    triggerEmails: false,
  },
};

export default function SalesSettingsPage() {
  const [settings, setSettings] = useState<SalesSettings>(DEFAULT_SETTINGS);
  const [leadInput, setLeadInput] = useState("");
  const [campaignInput, setCampaignInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/settings/sales", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have access to sales settings.");
        if (res.status === 401) throw new Error("Please sign in again to continue.");
        throw new Error(data?.error || "Unable to load settings.");
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      console.error("sales settings load error", err);
      setError(err.message || "Unable to load sales settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const addListItem = (key: "leadSources" | "campaignTags", value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSettings((prev) => {
      const existing = new Set(prev[key]);
      if (existing.has(trimmed)) return prev;
      return { ...prev, [key]: [...prev[key], trimmed] };
    });
  };

  const removeListItem = (key: "leadSources" | "campaignTags", value: string) => {
    setSettings((prev) => ({ ...prev, [key]: prev[key].filter((item) => item !== value) }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/settings/sales", {
        method: "PUT",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error("You do not have permission to edit sales settings.");
        throw new Error(data?.error || "Unable to save settings.");
      }
      setSuccess("Sales settings updated.");
    } catch (err: any) {
      console.error("sales settings save error", err);
      setError(err.message || "Unable to save sales settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">
          Only Super Admins can edit sales automations. You have view-only access.
        </SettingsAlert>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Sales Pipeline</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Manage lead sources, campaign tags, and closed-won automations.
            </p>
          </div>
          <button className="btn" onClick={handleSave} disabled={disabled} style={{ borderRadius: 999 }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>Pipeline Stages (locked)</div>
            <div className="space-y-2">
              {settings.pipelineStages.map((stage, index) => (
                <div key={stage} className="card" style={{ padding: 12, borderRadius: 12 }}>
                  <div style={{ fontWeight: 600 }}>
                    {index + 1}. {stage}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div style={{ fontWeight: 700 }}>Discount Approval Threshold (%)</div>
              <p style={{ fontSize: 12, color: "var(--sidebar-text)" }}>
                Discounts above this percentage require manager approval.
              </p>
              <input
                className="input"
                type="number"
                min={0}
                max={80}
                value={settings.discountApprovalThresholdPct}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    discountApprovalThresholdPct: Number(event.target.value || 0),
                  }))
                }
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <div style={{ fontWeight: 700 }}>Lead Sources</div>
              <div className="flex flex-wrap gap-2">
                {settings.leadSources.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>No lead sources configured.</div>
                )}
                {settings.leadSources.map((source) => (
                  <span key={source} className="card" style={{ padding: "6px 10px", borderRadius: 999 }}>
                    {source}
                    {!disabled && (
                      <button
                        className="btn ghost"
                        style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999 }}
                        onClick={() => removeListItem("leadSources", source)}
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
                  value={leadInput}
                  onChange={(e) => setLeadInput(e.target.value)}
                  disabled={disabled}
                />
                <button
                  className="btn ghost"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addListItem("leadSources", leadInput);
                    setLeadInput("");
                  }}
                  style={{ borderRadius: 999 }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div style={{ fontWeight: 700 }}>Campaign Tags</div>
              <div className="flex flex-wrap gap-2">
                {settings.campaignTags.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>No campaign tags configured.</div>
                )}
                {settings.campaignTags.map((tag) => (
                  <span key={tag} className="card" style={{ padding: "6px 10px", borderRadius: 999 }}>
                    {tag}
                    {!disabled && (
                      <button
                        className="btn ghost"
                        style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999 }}
                        onClick={() => removeListItem("campaignTags", tag)}
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
                  value={campaignInput}
                  onChange={(e) => setCampaignInput(e.target.value)}
                  disabled={disabled}
                />
                <button
                  className="btn ghost"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addListItem("campaignTags", campaignInput);
                    setCampaignInput("");
                  }}
                  style={{ borderRadius: 999 }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Closed Won Automations</div>
          <div className="grid gap-3 md:grid-cols-2">
            {([
              { key: "createClient", label: "Create client profile" },
              { key: "createProject", label: "Create project" },
              { key: "generateInvoice", label: "Generate invoice" },
              { key: "triggerEmails", label: "Trigger onboarding emails" },
            ] as const).map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.closedWonAutomations[item.key]}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      closedWonAutomations: { ...prev.closedWonAutomations, [item.key]: e.target.checked },
                    }))
                  }
                  disabled={disabled}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
