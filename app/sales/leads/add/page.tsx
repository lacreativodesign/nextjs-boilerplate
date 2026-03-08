"use client";

import React, { useState } from "react";

const serviceOptions = [
  "Website Design",
  "Branding",
  "Social Media Marketing",
  "SEO",
  "Mobile App Development",
  "Ecommerce Store",
];

const priorityOptions = ["Low", "Medium", "High", "Urgent"];

const assignedUsers = [
  "Unassigned",
  "Zain Ahmed",
  "Sarah Khan",
  "Ali Raza",
  "John Smith",
];

export default function AddLeadPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    service: "",
    source: "",
    priority: "Medium",
    assignedTo: "Unassigned",
    notes: "",
  });

  function updateField(key: string, value: string) {
    setForm({ ...form, [key]: value });
  }

  function handleSubmit(e: any) {
    e.preventDefault();
    alert("Lead created (UI only). Backend coming later.");
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 flex flex-col gap-6"
        >
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Create Lead
          </h1>

          {/* BASIC INFO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Full Name
              </label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Phone
              </label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Service
              </label>
              <select
                value={form.service}
                onChange={(e) => updateField("service", e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">Select Service</option>
                {serviceOptions.map((srv) => (
                  <option key={srv}>{srv}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Lead Source
              </label>
              <input
                type="text"
                placeholder="Website / Referral / Social Media"
                value={form.source}
                onChange={(e) => updateField("source", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => updateField("priority", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {priorityOptions.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Assign To
              </label>
              <select
                value={form.assignedTo}
                onChange={(e) => updateField("assignedTo", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {assignedUsers.map((usr) => (
                  <option key={usr}>{usr}</option>
                ))}
              </select>
            </div>
          </div>

          {/* NOTES */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Notes (optional)
            </label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          {/* SUBMIT */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 rounded-md bg-indigo-600 text-white text-sm shadow-sm hover:bg-indigo-700"
            >
              Create Lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
