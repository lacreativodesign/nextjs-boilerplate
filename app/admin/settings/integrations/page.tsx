"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/types";

type Webhook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: "active" | "disabled";
  description: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  responseStatus: number | null;
  responseBody: string | null;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: string;
  errorMessage: string | null;
};

type Health = {
  subscriptionId: string;
  healthy: boolean;
};

export default function IntegrationSettingsPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newWebhook, setNewWebhook] = useState({
    url: "",
    events: ["invoice.created"],
    secret: "",
    status: "active" as const,
    description: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, deliveryRes] = await Promise.all([
        fetch("/api/webhooks/subscriptions", { cache: "no-store", credentials: "include" }),
        fetch("/api/webhooks/deliveries?limit=100", { cache: "no-store", credentials: "include" }),
      ]);

      const subData = await subRes.json();
      const deliveryData = await deliveryRes.json();

      if (!subRes.ok || !subData?.ok) throw new Error(subData?.error || "Unable to load webhooks.");
      if (!deliveryRes.ok || !deliveryData?.ok) throw new Error(deliveryData?.error || "Unable to load deliveries.");

      setWebhooks(subData.subscriptions || []);
      setHealth(subData.health || []);
      setDeliveries(deliveryData.deliveries || []);
    } catch (err: any) {
      setError(err.message || "Unable to load webhook settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (event: string) => {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((item) => item !== event) : [...prev.events, event],
    }));
  };

  const createWebhook = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/webhooks/subscriptions", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWebhook),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to create webhook.");
      setSuccess("Webhook subscription created.");
      setNewWebhook({ url: "", events: ["invoice.created"], secret: "", status: "active", description: "" });
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to create webhook.");
    } finally {
      setSaving(false);
    }
  };

  const removeWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/subscriptions/${id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to delete webhook.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to delete webhook.");
    }
  };

  const testWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/subscriptions/${id}/test`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to send test event.");
      setSuccess(`Test sent. Deliveries created: ${data.deliveriesCreated}.`);
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to send test event.");
    }
  };

  const retryDelivery = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/deliveries/${id}/retry`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to retry delivery.");
      await load();
    } catch (err: any) {
      setError(err.message || "Unable to retry delivery.");
    }
  };

  const healthMap = useMemo(() => new Map(health.map((item) => [item.subscriptionId, item.healthy])), [health]);

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Webhook Subscriptions</div>
        <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Configure outbound real-time events for external integrations.</p>

        <div className="settings-divider" />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="https://hooks.zapier.com/..."
              value={newWebhook.url}
              onChange={(e) => setNewWebhook((prev) => ({ ...prev, url: e.target.value }))}
              disabled={saving || loading}
            />
            <input
              className="input"
              placeholder="Secret (optional)"
              value={newWebhook.secret}
              onChange={(e) => setNewWebhook((prev) => ({ ...prev, secret: e.target.value }))}
              disabled={saving || loading}
            />
          </div>
          <input
            className="input mt-3"
            placeholder="Description (optional)"
            value={newWebhook.description}
            onChange={(e) => setNewWebhook((prev) => ({ ...prev, description: e.target.value }))}
            disabled={saving || loading}
          />
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {WEBHOOK_EVENT_TYPES.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newWebhook.events.includes(event)} onChange={() => toggleEvent(event)} />
                <span>{event}</span>
              </label>
            ))}
          </div>
          <button className="btn subtle mt-4" type="button" onClick={createWebhook} disabled={saving || loading || !newWebhook.url.trim()}>
            {saving ? "Creating..." : "Create Webhook"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {loading && <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Loading...</div>}
          {!loading && webhooks.length === 0 && <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>No webhooks configured.</div>}
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div style={{ fontWeight: 700 }}>{webhook.url}</div>
                <div style={{ fontSize: 12 }}>{healthMap.get(webhook.id) ? "Healthy" : "Degraded"}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 8 }}>
                {webhook.events.join(", ")} · failures: {webhook.consecutiveFailures}
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn ghost" type="button" onClick={() => testWebhook(webhook.id)}>
                  Send Test
                </button>
                <button className="btn ghost" type="button" onClick={() => removeWebhook(webhook.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Delivery History</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ opacity: 0.7 }}>
                <th className="pb-2">Event</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Response</th>
                <th className="pb-2">Retries</th>
                <th className="pb-2">Payload</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-t border-white/10 align-top">
                  <td className="py-2">{delivery.eventType}</td>
                  <td className="py-2">{delivery.status}</td>
                  <td className="py-2">{delivery.responseStatus ?? "-"}</td>
                  <td className="py-2">{delivery.retryCount}</td>
                  <td className="py-2">
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(delivery.payload, null, 2)}</pre>
                  </td>
                  <td className="py-2">
                    {(delivery.status === "failed" || delivery.status === "retrying") && (
                      <button className="btn ghost" type="button" onClick={() => retryDelivery(delivery.id)}>
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
