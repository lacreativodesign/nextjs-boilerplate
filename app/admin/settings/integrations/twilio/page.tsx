"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type TriggerType =
  | "invoice_overdue_7_days"
  | "high_priority_task_assigned"
  | "project_deadline_approaching"
  | "payment_received"
  | "leave_request_urgent_approval"
  | "system_alert";

type TwilioConnection = {
  enabled: boolean;
  fromNumber: string | null;
  messagingServiceSid: string | null;
  statusCallbackUrl: string | null;
  enabledTriggers: TriggerType[];
  hasCredentials: boolean;
};

type SmsLog = {
  id: string;
  to: string;
  templateKey: string;
  triggerType: string | null;
  message: string;
  status: string;
  messageSid: string | null;
  errorMessage?: string | null;
  createdAt?: { _seconds?: number };
};

const TRIGGERS: { key: TriggerType; label: string }[] = [
  { key: "invoice_overdue_7_days", label: "Invoice overdue (7+ days)" },
  { key: "high_priority_task_assigned", label: "High-priority task assigned" },
  { key: "project_deadline_approaching", label: "Project deadline approaching" },
  { key: "payment_received", label: "Payment received" },
  { key: "leave_request_urgent_approval", label: "Leave request urgent approval" },
  { key: "system_alert", label: "System alerts" },
];

export default function TwilioIntegrationPage() {
  const [connection, setConnection] = useState<TwilioConnection | null>(null);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sendTo, setSendTo] = useState("");
  const [templateKey, setTemplateKey] = useState<TriggerType | "custom">("invoice_overdue_7_days");
  const [customMessage, setCustomMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connectionRes, logsRes] = await Promise.all([
        apiFetch("/api/integrations/twilio/connection", { cache: "no-store" }),
        apiFetch("/api/integrations/twilio/logs?limit=50", { cache: "no-store" }),
      ]);

      const connectionData = await connectionRes.json();
      const logsData = await logsRes.json();
      if (!connectionRes.ok || !connectionData?.ok) throw new Error(connectionData?.error || "Unable to load Twilio config.");
      if (!logsRes.ok || !logsData?.ok) throw new Error(logsData?.error || "Unable to load SMS logs.");

      setConnection(connectionData.connection);
      setLogs(logsData.logs || []);
    } catch (err: any) {
      setError(err.message || "Unable to load Twilio integration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const smsPreview = useMemo(() => {
    if (templateKey === "custom") return customMessage;
    const previewMap: Record<TriggerType, string> = {
      invoice_overdue_7_days: "Invoice INV-1008 is overdue by 9 days. Amount: $12,500.00. Please review immediately.",
      high_priority_task_assigned: "High-priority task assigned: Resolve procurement blocker (Project: HQ Launch). Due: 2026-03-15.",
      project_deadline_approaching: "Project Phoenix deadline is approaching on 2026-03-31. Owner: Sara Ahmed.",
      payment_received: "Payment received: $8,750.00 for invoice INV-1099 from Orbit Labs.",
      leave_request_urgent_approval: "Urgent leave request pending approval for Omar Ali (Sick Leave) from 2026-02-20 to 2026-02-22.",
      system_alert: "System alert [critical]: Email delivery queue latency exceeded threshold.",
    };
    return previewMap[templateKey];
  }, [templateKey, customMessage]);

  const saveConfig = async () => {
    if (!connection) return;
    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch("/api/integrations/twilio/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to save Twilio configuration.");
      setSuccess("Twilio configuration saved.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to save Twilio configuration.");
    } finally {
      setSaving(false);
    }
  };

  const sendTestSms = async () => {
    try {
      setSaving(true);
      setError(null);
      const payload = {
        to: sendTo,
        templateKey,
        triggerType: templateKey === "custom" ? undefined : templateKey,
        variables:
          templateKey === "custom"
            ? { message: customMessage }
            : {
                invoiceNumber: "INV-1008",
                daysOverdue: 9,
                amount: "$12,500.00",
                taskName: "Resolve procurement blocker",
                projectName: "HQ Launch",
                dueDate: "2026-03-15",
                deadlineDate: "2026-03-31",
                ownerName: "Sara Ahmed",
                payerName: "Orbit Labs",
                employeeName: "Omar Ali",
                leaveType: "Sick Leave",
                startDate: "2026-02-20",
                endDate: "2026-02-22",
                severity: "critical",
                alertMessage: "Email delivery queue latency exceeded threshold.",
              },
        metadata: { source: "twilio_setup_page_test" },
      };

      const res = await apiFetch("/api/integrations/twilio/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to send SMS.");
      setSuccess(`SMS queued. SID: ${data.result.messageSid}`);
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to send SMS.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !connection) {
    return <main className="p-6">Loading Twilio integration...</main>;
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Twilio SMS Setup</h1>
      <p className="text-sm text-[var(--sidebar-text)]">Configure Twilio phone routing, trigger mapping, and delivery tracking for critical ERP alerts.</p>

      {error ? <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">{success}</div> : null}

      <section className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold">Twilio account configuration</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(connection?.enabled)}
            onChange={(e) => setConnection((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))}
          />
          Enable Twilio SMS integration
        </label>
        <div className="text-sm">Credentials configured in environment: <strong>{connection?.hasCredentials ? "Yes" : "No"}</strong></div>
        <label className="block text-sm">
          <span>From phone number (E.164)</span>
          <input
            className="input mt-1 w-full"
            value={connection?.fromNumber || ""}
            onChange={(e) => setConnection((prev) => (prev ? { ...prev, fromNumber: e.target.value || null } : prev))}
            placeholder="+15551234567"
          />
        </label>
        <label className="block text-sm">
          <span>Messaging Service SID (optional)</span>
          <input
            className="input mt-1 w-full"
            value={connection?.messagingServiceSid || ""}
            onChange={(e) => setConnection((prev) => (prev ? { ...prev, messagingServiceSid: e.target.value || null } : prev))}
            placeholder="MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          />
        </label>
        <button className="btn" type="button" onClick={saveConfig} disabled={saving}>Save Twilio config</button>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold">SMS triggers</h2>
        {TRIGGERS.map((trigger) => (
          <label className="flex items-center gap-2 text-sm" key={trigger.key}>
            <input
              type="checkbox"
              checked={Boolean(connection?.enabledTriggers?.includes(trigger.key))}
              onChange={(e) => {
                setConnection((prev) => {
                  if (!prev) return prev;
                  const next = new Set(prev.enabledTriggers || []);
                  if (e.target.checked) next.add(trigger.key);
                  else next.delete(trigger.key);
                  return { ...prev, enabledTriggers: Array.from(next) as TriggerType[] };
                });
              }}
            />
            {trigger.label}
          </label>
        ))}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold">SMS preview + send test</h2>
        <label className="block text-sm">
          <span>Recipient phone number</span>
          <input className="input mt-1 w-full" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="+15551230001" />
        </label>
        <label className="block text-sm">
          <span>Template</span>
          <select className="input mt-1 w-full" value={templateKey} onChange={(e) => setTemplateKey(e.target.value as TriggerType | "custom")}>
            {TRIGGERS.map((trigger) => (
              <option value={trigger.key} key={trigger.key}>{trigger.label}</option>
            ))}
            <option value="custom">Custom message</option>
          </select>
        </label>
        {templateKey === "custom" ? (
          <label className="block text-sm">
            <span>Custom message</span>
            <textarea className="input mt-1 w-full min-h-24" value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} />
          </label>
        ) : null}
        <div className="rounded-md border p-3 text-sm bg-black/5">
          <div className="font-semibold mb-1">Preview</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{smsPreview}</div>
        </div>
        <button className="btn" type="button" disabled={saving || !sendTo} onClick={sendTestSms}>Send test SMS</button>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold">Delivery status log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Template</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">SID</th>
                <th className="py-2 pr-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b align-top">
                  <td className="py-2 pr-3">{log.to}</td>
                  <td className="py-2 pr-3">{log.templateKey}</td>
                  <td className="py-2 pr-3">{log.status}</td>
                  <td className="py-2 pr-3">{log.messageSid || "-"}</td>
                  <td className="py-2 pr-3">{log.errorMessage || "-"}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr>
                  <td className="py-3" colSpan={5}>No SMS logs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
