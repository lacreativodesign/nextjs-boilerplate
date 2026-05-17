"use client";

import { OptimizedImage } from "@/components/OptimizedImage";
import { useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";

type BrandingState = {
  logoUrl: string | null;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  themeMode: "light" | "dark" | "system";
  emailBranding: {
    fromName: string;
    fromEmail: string;
    emailFooter: string;
    status: "pending" | "verified";
    spfValid: boolean;
    dkimValid: boolean;
  };
  customDomains: Array<{
    domain: string;
    status: "pending" | "verified";
    verificationToken: string;
  }>;
};

const DEFAULT_STATE: BrandingState = {
  logoUrl: null,
  tagline: null,
  primaryColor: "#2563eb",
  secondaryColor: "#1d4ed8",
  accentColor: "#14b8a6",
  fontFamily: "Inter",
  themeMode: "system",
  emailBranding: {
    fromName: "BIZOSTO ERP",
    fromEmail: "",
    emailFooter: "Thanks,\nBIZOSTO ERP Team",
    status: "pending",
    spfValid: false,
    dkimValid: false,
  },
  customDomains: [],
};

export default function BrandingSettingsPage() {
  const [state, setState] = useState<BrandingState>(DEFAULT_STATE);
  const [fonts, setFonts] = useState<string[]>(["Inter"]);
  const [domainInput, setDomainInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const previewStyle = useMemo(
    () => ({
      ["--erp-blue" as string]: state.primaryColor,
      ["--erp-blue-hover" as string]: state.secondaryColor,
      ["--brand-accent" as string]: state.accentColor,
      fontFamily: `${state.fontFamily}, system-ui`,
    }),
    [state.primaryColor, state.secondaryColor, state.accentColor, state.fontFamily]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/branding", { credentials: "include", cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      setError(data?.error || "Failed to load branding settings.");
      setLoading(false);
      return;
    }
    setState({ ...DEFAULT_STATE, ...data.branding, emailBranding: { ...DEFAULT_STATE.emailBranding, ...data.branding.emailBranding } });
    setFonts(data.fonts || ["Inter"]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const onLogoChange = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      const res = await fetch("/api/admin/branding/logo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, contentType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || "Logo upload failed.");
        return;
      }
      setState((prev) => ({ ...prev, logoUrl: data.logoUrl }));
      setSuccess("Logo uploaded successfully.");
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/admin/branding", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logoUrl: state.logoUrl,
        tagline: state.tagline?.trim() || null,
        primaryColor: state.primaryColor,
        secondaryColor: state.secondaryColor,
        accentColor: state.accentColor,
        fontFamily: state.fontFamily,
        themeMode: state.themeMode,
        emailBranding: {
          fromName: state.emailBranding.fromName,
          fromEmail: state.emailBranding.fromEmail,
          emailFooter: state.emailBranding.emailFooter,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data?.error || "Failed to save branding settings.");
      setSaving(false);
      return;
    }
    setSuccess("Branding settings saved.");
    setState((prev) => ({ ...prev, ...data.branding }));
    setSaving(false);
  };

  const verifyDomain = async () => {
    setError(null);
    const res = await fetch("/api/admin/domains/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domainInput }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data?.error || "Domain verification failed.");
      return;
    }
    setSuccess(data.verified ? "Domain verified." : "TXT record not found yet. Follow setup instructions and retry.");
    void load();
  };

  const verifyEmail = async () => {
    setError(null);
    const res = await fetch("/api/admin/email/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEmail: state.emailBranding.fromEmail }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data?.error || "Email verification failed.");
      return;
    }
    setSuccess(data.verification.verified ? "Email sender verified." : "SPF/DKIM records are incomplete.");
    void load();
  };

  if (loading) return <div className="card p-5">Loading branding settings...</div>;

  return (
    <div className="space-y-6">
      {error ? <SettingsAlert tone="error">{error}</SettingsAlert> : null}
      {success ? <SettingsAlert tone="success">{success}</SettingsAlert> : null}

      <section className="card p-5 rounded-xl settings-section space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">White-label Branding</h3>
            <p className="text-sm opacity-70">Manage logo, color palette, domain mapping, and branded email sender.</p>
          </div>
          <button className="btn subtle rounded-full" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Logo uploader</label>
              <label className="mt-2 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] p-6 text-sm">
                <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => e.target.files?.[0] && void onLogoChange(e.target.files[0])} />
                Drag-and-drop or click to upload logo
              </label>
            </div>
            <label className="block text-sm font-medium">
              Sidebar tagline
              <input
                className="input mt-2"
                maxLength={80}
                placeholder="Powered by Bizosto®"
                value={state.tagline || ""}
                onChange={(e) => setState((prev) => ({ ...prev, tagline: e.target.value }))}
              />
            </label>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Font selector (Google Fonts)</label>
            <select className="input" value={state.fontFamily} onChange={(e) => setState((prev) => ({ ...prev, fontFamily: e.target.value }))}>
              {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
            <label className="text-sm font-medium">Theme mode</label>
            <select className="input" value={state.themeMode} onChange={(e) => setState((prev) => ({ ...prev, themeMode: e.target.value as BrandingState["themeMode"] }))}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {(["primaryColor", "secondaryColor", "accentColor"] as const).map((field) => (
            <label key={field} className="text-sm font-medium">{field}<input type="color" className="input mt-2 h-12" value={state[field]} onChange={(e) => setState((prev) => ({ ...prev, [field]: e.target.value }))} /></label>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Custom domain setup</label>
            <input className="input" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="app.yourcompany.com" />
            <button className="btn subtle rounded-full" onClick={verifyDomain}>Verify Domain</button>
            <p className="helper-text">Add TXT record <code>_bizosto-verify.yourdomain.com</code> with token shown after first verification attempt.</p>
            <ul className="text-sm space-y-1">
              {state.customDomains.map((domain) => (
                <li key={domain.domain}>{domain.domain} — {domain.status} — token: <code>{domain.verificationToken}</code></li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email branding</label>
            <input className="input" placeholder="From name" value={state.emailBranding.fromName} onChange={(e) => setState((prev) => ({ ...prev, emailBranding: { ...prev.emailBranding, fromName: e.target.value } }))} />
            <input className="input" placeholder="from@yourcompany.com" value={state.emailBranding.fromEmail} onChange={(e) => setState((prev) => ({ ...prev, emailBranding: { ...prev.emailBranding, fromEmail: e.target.value } }))} />
            <textarea className="input" placeholder="Email footer" value={state.emailBranding.emailFooter} onChange={(e) => setState((prev) => ({ ...prev, emailBranding: { ...prev.emailBranding, emailFooter: e.target.value } }))} />
            <button className="btn subtle rounded-full" onClick={verifyEmail}>Verify Sender (SPF/DKIM)</button>
            <p className="helper-text">Status: {state.emailBranding.status} | SPF: {state.emailBranding.spfValid ? "OK" : "Missing"} | DKIM: {state.emailBranding.dkimValid ? "OK" : "Missing"}</p>
          </div>
        </div>
      </section>

      <section className="card p-5 rounded-xl" style={previewStyle}>
        <h4 className="font-semibold">Live Theme Preview</h4>
        <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--erp-blue)" }}>
          <div className="flex items-center gap-3">
            {state.logoUrl ? <div className="relative h-8 w-8 overflow-hidden rounded"><OptimizedImage src={state.logoUrl} alt="logo" width={32} height={32} className="h-8 w-8 object-contain" sizes="32px" priority disableManualLazy /></div> : <div className="h-8 w-8 rounded bg-[var(--erp-blue)]" />}
            <div>
              <div className="font-semibold">{state.emailBranding.fromName}</div>
              <div className="text-sm opacity-70">{state.emailBranding.fromEmail || "sender@company.com"}</div>
            </div>
          </div>
          <button className="mt-4 rounded-lg px-4 py-2 text-white" style={{ backgroundColor: "var(--erp-blue)" }}>Primary CTA</button>
          <button className="mt-4 ml-2 rounded-lg px-4 py-2 text-white" style={{ backgroundColor: "var(--brand-accent)" }}>Accent CTA</button>
          <p className="mt-4 text-sm whitespace-pre-line">{state.emailBranding.emailFooter}</p>
        </div>
      </section>
    </div>
  );
}
