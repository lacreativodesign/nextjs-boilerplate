"use client";

import { FormEvent, useState } from "react";

import { apiFetch } from "@/lib/api/client";

type CreateCustomerDialogProps = {
  onSuccess: () => Promise<void> | void;
};

export function CreateCustomerDialog({ onSuccess }: CreateCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "lead",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    companyName: "",
    jobTitle: "",
    industry: "",
    leadSource: "",
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create customer");
      }

      setOpen(false);
      setForm({
        type: "lead",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        companyName: "",
        jobTitle: "",
        industry: "",
        leadSource: "",
      });
      await onSuccess();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Add Customer
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSubmit} className="card w-full max-w-2xl p-6">
            <h2 className="mb-4 text-xl font-semibold">Create Customer</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
                <option value="partner">Partner</option>
              </select>
              <input className="input" placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <input className="input" placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="input" placeholder="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              <input className="input" placeholder="Job title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              <input className="input" placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              <input className="input" placeholder="Lead source" value={form.leadSource} onChange={(e) => setForm({ ...form, leadSource: e.target.value })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Saving..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
