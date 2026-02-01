"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { useIsSystemDark } from "@/components/finance/financeUtils";

type Settings = {
  defaultOnboardingTemplateId: string | null;
  retentionNote: string;
};

type Template = {
  id: string;
  name: string;
};

export default function HrSettingsPage() {
  const isDark = useIsSystemDark();
  const [settings, setSettings] = useState<Settings>({
    defaultOnboardingTemplateId: null,
    retentionNote: "Documents are retained for 7 years by default.",
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [settingsRes, templatesRes] = await Promise.all([
          fetch("/api/hr/settings", { cache: "no-store", credentials: "include" }),
          fetch("/api/hr/onboarding/templates/list", { cache: "no-store", credentials: "include" }),
        ]);
        const settingsJson = await settingsRes.json();
        const templatesJson = await templatesRes.json();
        if (!settingsRes.ok || !settingsJson.ok) throw new Error(settingsJson?.error || "Unable to load settings.");
        if (!templatesRes.ok || !templatesJson.ok) throw new Error(templatesJson?.error || "Unable to load templates.");
        if (!alive) return;
        setSettings(settingsJson.settings || settings);
        setTemplates(templatesJson.templates || []);
      } catch (err) {
        if (!alive) return;
        console.error("HR settings load error", err);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const templateOptions = useMemo(
    () => [{ label: "No default", value: "" }, ...templates.map((t) => ({ label: t.name, value: t.id }))],
    [templates]
  );

  async function saveSettings() {
    try {
      setSaving(true);
      const res = await fetch("/api/hr/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          defaultOnboardingTemplateId: settings.defaultOnboardingTemplateId || null,
          retentionNote: settings.retentionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to save settings.");
    } catch (err: any) {
      alert(err?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card settings-section" style={{ padding: 18, borderRadius: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Settings</div>
        <div style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
          Manage default HR policies and onboarding behavior.
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 settings-section">
        <div
          className="card"
          style={{
            padding: 18,
            borderRadius: 18,
            border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Role Permissions Summary</div>
          <ul className="space-y-2" style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
            <li>SUPER_ADMIN & ADMIN: full access to HR module.</li>
            <li>HR: can edit users except email; cannot manage SUPER_ADMIN accounts.</li>
            <li>Admin cannot assign SUPER_ADMIN role.</li>
          </ul>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Default Onboarding Assignment</div>
          {loading ? (
            <div style={{ color: "var(--sidebar-text)" }}>Loading settings…</div>
          ) : (
            <div className="space-y-3">
              <MasterSelect
                value={settings.defaultOnboardingTemplateId || ""}
                onChange={(value) => setSettings((prev) => ({ ...prev, defaultOnboardingTemplateId: value || null }))}
                options={templateOptions}
              />
              <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
                Optional: automatically assign this template to new hires (automation stub).
              </p>
              <button className="btn subtle" onClick={saveSettings} disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 18, borderRadius: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Document Retention</div>
        <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>{settings.retentionNote}</p>
      </section>
    </div>
  );
}
