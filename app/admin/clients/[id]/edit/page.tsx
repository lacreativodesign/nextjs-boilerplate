"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function EditClientPage() {
  const router = useRouter();
  const params = useParams();
  const id = String((params as any)?.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState<any>({
    companyName: "",
    website: "",
    industry: "",
    country: "",
    timezone: "",

    primaryContactName: "",
    primaryContactTitle: "",
    primaryContactEmail: "",
    primaryContactPhone: "",

    salesStage: "New Lead",
    paymentStatus: "Unpaid",
    retainerStatus: "None",

    salesOwner: "",
    accountManager: "",
    productionOwner: "",

    totalContractValueUsd: 0,
    totalPaidUsd: 0,
    openBalanceUsd: 0,
    services: "",
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        const res = await fetch(`/api/admin/clients/get?id=${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load client");

        if (!alive) return;
        const c = json.client || {};
        setForm({
          companyName: c.companyName || "",
          website: c.website || "",
          industry: c.industry || "",
          country: c.country || "",
          timezone: c.timezone || "",

          primaryContactName: c.primaryContactName || "",
          primaryContactTitle: c.primaryContactTitle || "",
          primaryContactEmail: c.primaryContactEmail || "",
          primaryContactPhone: c.primaryContactPhone || "",

          salesStage: c.salesStage || "New Lead",
          paymentStatus: c.paymentStatus || "Unpaid",
          retainerStatus: c.retainerStatus || "None",

          salesOwner: c.salesOwner || "",
          accountManager: c.accountManager || "",
          productionOwner: c.productionOwner || "",

          totalContractValueUsd: Number(c.totalContractValueUsd || 0),
          totalPaidUsd: Number(c.totalPaidUsd || 0),
          openBalanceUsd: Number(c.openBalanceUsd || 0),
          services: c.services || "",
        });
      } catch (e: any) {
        if (!alive) return;
        setMsg(e?.message || "Failed to load client");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    if (id) load();
    return () => {
      alive = false;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/clients/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...form }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update");

      setMsg("Updated successfully");
      router.push("/admin/clients/key-accounts"); // or /admin/clients
    } catch (e: any) {
      setMsg(e?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 18 }}>Loading...</div>;

  // NOTE: I’m not touching your locked form UI here.
  // If you want, paste your exact Add Client form UI and we’ll swap inputs 1:1.
  return (
    <div style={{ padding: 18, maxWidth: 980 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Edit Client</h1>
      {msg ? <div style={{ marginBottom: 10, opacity: 0.85 }}>{msg}</div> : null}

      <div style={{ display: "grid", gap: 10 }}>
        <input value={form.companyName} onChange={(e) => setForm((p: any) => ({ ...p, companyName: e.target.value }))} placeholder="Company Name" />
        <input value={form.primaryContactEmail} onChange={(e) => setForm((p: any) => ({ ...p, primaryContactEmail: e.target.value }))} placeholder="Primary Email" />
        <input value={form.primaryContactName} onChange={(e) => setForm((p: any) => ({ ...p, primaryContactName: e.target.value }))} placeholder="Primary Contact Name" />

        <button onClick={save} disabled={saving} style={{ padding: "10px 12px", borderRadius: 10 }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
