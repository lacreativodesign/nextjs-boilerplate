"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Policy = {
  id: string;
  entityType: string;
  collectionPath: string;
  retentionDays: number;
  action: "delete" | "archive";
  enabled: boolean;
};

type ConsentRecord = {
  id: string;
  userId: string;
  consentType: string;
  granted: boolean;
  version: string;
  updatedAt?: string;
};

export default function CompliancePage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [status, setStatus] = useState<string>("");

  const [policyForm, setPolicyForm] = useState({
    entityType: "documents",
    collectionPath: "documents",
    retentionDays: 365,
    action: "archive",
  });

  const [exportForm, setExportForm] = useState({ subjectUserId: "", format: "json" });
  const [deleteForm, setDeleteForm] = useState({ subjectUserId: "", mode: "anonymize" });
  const [consentForm, setConsentForm] = useState({ userId: "", consentType: "privacy", granted: true, version: "v1" });

  const policySummary = useMemo(() => {
    return {
      total: policies.length,
      deleteCount: policies.filter((p) => p.action === "delete").length,
      archiveCount: policies.filter((p) => p.action === "archive").length,
    };
  }, [policies]);

  async function refreshPolicies() {
    const response = await apiFetch("/api/compliance/policies");
    const json = await response.json();
    setPolicies(json.policies || []);
  }

  async function refreshConsentRecords() {
    const response = await apiFetch("/api/compliance/consent");
    const json = await response.json();
    setConsents(json.consentRecords || []);
  }

  useEffect(() => {
    void refreshPolicies();
    void refreshConsentRecords();
  }, []);

  async function onCreatePolicy(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    const response = await apiFetch("/api/compliance/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policyForm),
    });
    if (!response.ok) {
      setStatus("Failed to create retention policy.");
      return;
    }
    await refreshPolicies();
    setStatus("Retention policy created.");
  }

  async function onRequestExport(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    const response = await apiFetch("/api/compliance/export-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportForm),
    });
    if (!response.ok) {
      setStatus("GDPR export failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gdpr-export-${exportForm.subjectUserId}.${exportForm.format}`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("GDPR export completed and downloaded.");
  }

  async function onRequestDeletion(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    const response = await apiFetch("/api/compliance/delete-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deleteForm),
    });
    setStatus(response.ok ? "GDPR deletion request completed." : "GDPR deletion failed.");
  }

  async function onExportAuditCsv() {
    const response = await apiFetch("/api/compliance/audit-trail?format=csv");
    if (!response.ok) {
      setStatus("Audit trail export failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-trail.csv";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Audit trail exported.");
  }

  async function onGenerateReport() {
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setUTCDate(periodStart.getUTCDate() - 30);

    const response = await apiFetch("/api/compliance/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "summary", periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() }),
    });

    setStatus(response.ok ? "Compliance report generated." : "Report generation failed.");
  }

  async function onRecordConsent(e: FormEvent) {
    e.preventDefault();
    const response = await apiFetch("/api/compliance/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consentForm),
    });
    if (!response.ok) {
      setStatus("Consent record failed.");
      return;
    }
    await refreshConsentRecords();
    setStatus("Consent record saved.");
  }

  return (
    <div className="page-frame space-y-8">
      <h1 className="text-2xl font-semibold">Compliance Dashboard</h1>
      {status && <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-primary)]">{status}</div>}

      <section className="rounded border p-4">
        <h2 className="mb-4 text-lg font-medium">Data retention policy manager</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={onCreatePolicy}>
          <input className="rounded border p-2" placeholder="Entity type" value={policyForm.entityType} onChange={(e) => setPolicyForm((v) => ({ ...v, entityType: e.target.value }))} />
          <input className="rounded border p-2" placeholder="Collection path" value={policyForm.collectionPath} onChange={(e) => setPolicyForm((v) => ({ ...v, collectionPath: e.target.value }))} />
          <input className="rounded border p-2" type="number" value={policyForm.retentionDays} onChange={(e) => setPolicyForm((v) => ({ ...v, retentionDays: Number(e.target.value) }))} />
          <select className="rounded border p-2" value={policyForm.action} onChange={(e) => setPolicyForm((v) => ({ ...v, action: e.target.value as "delete" | "archive" }))}>
            <option value="archive">Archive</option>
            <option value="delete">Delete</option>
          </select>
          <button className="rounded bg-black px-3 py-2 text-white md:col-span-4">Create policy</button>
        </form>
        <p className="mt-4 text-sm">Total policies: {policySummary.total} | Archive: {policySummary.archiveCount} | Delete: {policySummary.deleteCount}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form className="rounded border p-4" onSubmit={onRequestExport}>
          <h2 className="mb-3 text-lg font-medium">GDPR data export request</h2>
          <input className="mb-2 w-full rounded border p-2" placeholder="User ID" value={exportForm.subjectUserId} onChange={(e) => setExportForm((v) => ({ ...v, subjectUserId: e.target.value }))} />
          <select className="mb-3 w-full rounded border p-2" value={exportForm.format} onChange={(e) => setExportForm((v) => ({ ...v, format: e.target.value as "json" | "csv" }))}>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
          <button className="rounded bg-black px-3 py-2 text-white">Export data</button>
        </form>

        <form className="rounded border p-4" onSubmit={onRequestDeletion}>
          <h2 className="mb-3 text-lg font-medium">GDPR data deletion</h2>
          <input className="mb-2 w-full rounded border p-2" placeholder="User ID" value={deleteForm.subjectUserId} onChange={(e) => setDeleteForm((v) => ({ ...v, subjectUserId: e.target.value }))} />
          <select className="mb-3 w-full rounded border p-2" value={deleteForm.mode} onChange={(e) => setDeleteForm((v) => ({ ...v, mode: e.target.value as "anonymize" | "delete" }))}>
            <option value="anonymize">Anonymize</option>
            <option value="delete">Delete</option>
          </select>
          <button className="rounded bg-black px-3 py-2 text-white">Delete/anonymize data</button>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Audit trail export</h2>
        <button className="rounded bg-black px-3 py-2 text-white" onClick={onExportAuditCsv}>Export CSV</button>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Compliance reports</h2>
        <button className="rounded bg-black px-3 py-2 text-white" onClick={onGenerateReport}>Generate monthly summary</button>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Consent management</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={onRecordConsent}>
          <input className="rounded border p-2" placeholder="User ID" value={consentForm.userId} onChange={(e) => setConsentForm((v) => ({ ...v, userId: e.target.value }))} />
          <select className="rounded border p-2" value={consentForm.consentType} onChange={(e) => setConsentForm((v) => ({ ...v, consentType: e.target.value }))}>
            <option value="privacy">Privacy</option>
            <option value="terms">Terms</option>
            <option value="marketing">Marketing</option>
            <option value="data_processing">Data processing</option>
          </select>
          <input className="rounded border p-2" placeholder="Version" value={consentForm.version} onChange={(e) => setConsentForm((v) => ({ ...v, version: e.target.value }))} />
          <select className="rounded border p-2" value={String(consentForm.granted)} onChange={(e) => setConsentForm((v) => ({ ...v, granted: e.target.value === "true" }))}>
            <option value="true">Granted</option>
            <option value="false">Denied</option>
          </select>
          <button className="rounded bg-black px-3 py-2 text-white md:col-span-4">Save consent</button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>User</th><th>Type</th><th>Granted</th><th>Version</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((record) => (
                <tr key={record.id} className="border-t">
                  <td>{record.userId}</td>
                  <td>{record.consentType}</td>
                  <td>{record.granted ? "Yes" : "No"}</td>
                  <td>{record.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
