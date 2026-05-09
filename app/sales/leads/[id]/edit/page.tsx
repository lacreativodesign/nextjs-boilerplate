"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/utils/toast";

const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const SOURCES = ["Website", "Referral", "Cold Outreach", "LinkedIn", "Event", "Social Media", "Other"];

type LeadForm = {
  name: string;
  email: string;
  phone: string;
  stage: string;
  source: string;
};

export default function EditLeadPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<LeadForm>({
    name: "",
    email: "",
    phone: "",
    stage: "New",
    source: "Website",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/sales/leads/list", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!json?.ok) {
          showToast.error("Failed to load lead.");
          setNotFound(true);
          return;
        }
        const lead = (json.leads || []).find((l: any) => l.id === id);
        if (!lead) {
          setNotFound(true);
          return;
        }
        setForm({
          name: lead.name || "",
          email: lead.email || "",
          phone: lead.phone || "",
          stage: lead.stage || "New",
          source: lead.source || "Website",
        });
      } catch {
        showToast.error("Error loading lead.");
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const handleChange = (key: keyof LeadForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      showToast.error("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sales/leads/update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...form }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        showToast.error(json?.error || "Failed to update lead.");
        return;
      }
      showToast.success("Lead updated successfully.");
      router.push("/sales/leads");
    } catch {
      showToast.error("Error saving lead.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-frame">
        <p className="text-sm text-[var(--text-muted)]">Loading lead…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page-frame">
        <p className="text-sm text-[var(--text-muted)]">Lead not found.</p>
        <button type="button" onClick={() => router.push("/sales/leads")} className="btn mt-4">
          Back to Leads
        </button>
      </div>
    );
  }

  return (
    <div className="page-frame">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push("/sales/leads")}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ← Back to Leads
        </button>
      </div>
      <div className="max-w-2xl">
        <h1 className="page-title mb-1">Edit Lead</h1>
        <p className="page-subtitle mb-6">Update lead information and pipeline stage.</p>
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="label" htmlFor="name">Full Name</label>
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="jane@company.com"
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="label" htmlFor="phone">Phone</label>
              <input
                id="phone"
                type="tel"
                className="input"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label" htmlFor="stage">Stage</label>
              <select
                id="stage"
                className="input"
                value={form.stage}
                onChange={(e) => handleChange("stage", e.target.value)}
              >
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="label" htmlFor="source">Source</label>
            <select
              id="source"
              className="input"
              value={form.source}
              onChange={(e) => handleChange("source", e.target.value)}
            >
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/sales/leads")}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
