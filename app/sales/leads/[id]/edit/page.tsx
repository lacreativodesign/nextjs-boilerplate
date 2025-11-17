"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

// Same dropdown data used in Add Lead
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

export default function EditLeadPage({ params }: any) {
  const { id } = params;

  // PRE-FILLED DUMMY DATA UNTIL BACKEND IS CONNECTED
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

  // Load dummy lead data (UI only)
  useEffect(() => {
    // IN FUTURE: replace with API call
    setForm({
      fullName: "John Doe",
      email: "john@example.com",
      phone: "+1 555 900 233",
      service: "Website Design",
      source: "Website Form",
      priority: "High",
      assignedTo: "Zain Ahmed",
      notes: "Interested in corporate website redesign.",
    });
  }, [id]);

  function updateField(key: string, value: string) {
    setForm({ ...form, [key]: value });
  }

  function handleSubmit(e: any) {
    e.preventDefault();
    alert("Lead updated (UI only). Backend will come later.");
  }

  return (
    <ERPLayout pageTitle={`Edit Lead #${id}`}>
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 flex flex-col gap-6"
        >
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Edit Lead
          </h1>

          {/* FORM GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FULL NAME */}
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Full Name
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                required
              />
            </div>

            {/* EMAIL */}
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                required
              />
            </div>

            {/* PHONE */}
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                required
              />
            </div>

            {/* SERVICE */}
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Service
              </label>
              <select
                value={form.service}
                onChange={(e) => updateField("service", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                required
              >
                <option value="">Select Service</option>
                {serviceOptions.map((srv) => (
                  <option key={srv}>{srv}</option>
                ))}
              </select>
            </div>

            {/* SOURCE */}
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Lead Source
              </label>
              <input
                type="text"
                value={form.source}
                onChange={(e) => updateField("source", e.target.value)}
                placeholder="Website / Referral / Social Media"
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            {/* PRIORITY */}
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

            {/* ASSIGN TO */}
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
              Notes
            </label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          {/* SUBMIT BUTTON */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 rounded-md bg-indigo-600 text-white text-sm shadow-sm hover:bg-indigo-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </ERPLayout>
  );
    }
