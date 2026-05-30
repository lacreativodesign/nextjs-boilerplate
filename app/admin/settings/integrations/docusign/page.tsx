"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsAlert } from "../../_components/SettingsAlert";

type DocusignConnection = {
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  baseUri: string | null;
};

type EnvelopeStatus = {
  envelopeId: string;
  status: string;
  completedAt: string | null;
  signerEmails: string[];
  sourceFileName: string | null;
  signedDocumentFileName: string | null;
  signedDocumentDownloadedAt: string | null;
  downloadUrl: string | null;
};

export default function DocusignIntegrationPage() {
  const [connection, setConnection] = useState<DocusignConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("Please sign this document");
  const [message, setMessage] = useState("Please review and sign this document.");
  const [signerEmails, setSignerEmails] = useState("");
  const [envelopeId, setEnvelopeId] = useState("");
  const [status, setStatus] = useState<EnvelopeStatus | null>(null);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/docusign/oauth", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to load DocuSign state.");
      setConnection(data.connection || null);
    } catch (err) {
      setError((err as Record<string, unknown>).message || "Unable to load DocuSign state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  const connectDocuSign = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/integrations/docusign/oauth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true, returnTo: "/admin/settings/integrations/docusign" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.authorizeUrl) throw new Error(data?.error || "Unable to start DocuSign OAuth.");
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setError((err as Record<string, unknown>).message || "Unable to connect DocuSign.");
      setSaving(false);
    }
  };

  const sendForSignature = async () => {
    if (!file) {
      setError("Please choose a PDF file.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("signerEmails", signerEmails);
      formData.append("subject", subject);
      formData.append("message", message);

      const res = await fetch("/api/integrations/docusign/send", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to send envelope.");

      setEnvelopeId(data.envelopeId || "");
      setSuccess(`Envelope sent: ${data.envelopeId}`);
      setStatus(null);
    } catch (err) {
      setError((err as Record<string, unknown>).message || "Failed to send envelope.");
    } finally {
      setSaving(false);
    }
  };

  const fetchStatus = async () => {
    if (!envelopeId.trim()) {
      setError("Envelope ID is required.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/integrations/docusign/status/${encodeURIComponent(envelopeId.trim())}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to fetch envelope status.");
      setStatus(data.envelope || null);
      setSuccess("Envelope status refreshed.");
    } catch (err) {
      setError((err as Record<string, unknown>).message || "Unable to fetch envelope status.");
    } finally {
      setSaving(false);
    }
  };

  const sendReminder = async () => {
    const recipients = signerEmails
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!envelopeId.trim() || !recipients.length) {
      setError("Envelope ID and signer emails are required to send reminders.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/integrations/docusign/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind", envelopeId: envelopeId.trim(), signerEmails: recipients }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to send reminder.");
      setSuccess("Reminder sent to signers.");
    } catch (err) {
      setError((err as Record<string, unknown>).message || "Unable to send reminder.");
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>DocuSign E-Signature</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Connect DocuSign, upload documents, send for signature, and track completion.</p>
          </div>
          <button className="btn subtle" type="button" onClick={connectDocuSign} disabled={saving || loading}>
            {connection?.connected ? "Reconnect DocuSign" : "Connect DocuSign"}
          </button>
        </div>

        <div className="settings-divider" />

        <div style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Status: {connection?.connected ? "Connected" : "Not connected"}</div>
        <div style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Account: {connection?.accountName || connection?.accountId || "-"}</div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Upload document to sign</div>
        <div className="settings-divider" />

        <label className="block text-sm">PDF document</label>
        <input className="input mt-2" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />

        <label className="block text-sm mt-3">Signer emails (comma separated)</label>
        <input className="input mt-2" value={signerEmails} onChange={(e) => setSignerEmails(e.target.value)} placeholder="signer1@company.com, signer2@company.com" />

        <label className="block text-sm mt-3">Subject</label>
        <input className="input mt-2" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label className="block text-sm mt-3">Message</label>
        <textarea className="input mt-2" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />

        <button className="btn ghost mt-3" type="button" onClick={sendForSignature} disabled={saving || loading || !connection?.connected}>
          Send for signature
        </button>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Signature status tracker</div>
        <div className="settings-divider" />

        <label className="block text-sm">Envelope ID</label>
        <input className="input mt-2" value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)} placeholder="DocuSign envelope ID" />

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn ghost" type="button" onClick={fetchStatus} disabled={saving || !connection?.connected || !envelopeId.trim()}>
            Refresh status
          </button>
          <button className="btn ghost" type="button" onClick={sendReminder} disabled={saving || !connection?.connected || !envelopeId.trim()}>
            Remind signers
          </button>
        </div>

        {status && (
          <div className="card mt-4" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700 }}>Current status: {status.status}</div>
            <div style={{ fontSize: 13, color: "var(--sidebar-text)", marginTop: 4 }}>Completed at: {status.completedAt || "-"}</div>
            <div style={{ fontSize: 13, color: "var(--sidebar-text)", marginTop: 4 }}>Signers: {status.signerEmails.join(", ") || "-"}</div>
            <div style={{ fontSize: 13, color: "var(--sidebar-text)", marginTop: 4 }}>Signed document: {status.signedDocumentFileName || "Not available yet"}</div>
            {status.downloadUrl && (
              <a className="btn subtle mt-3 inline-flex" href={status.downloadUrl} target="_blank" rel="noreferrer">
                Download signed document
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
