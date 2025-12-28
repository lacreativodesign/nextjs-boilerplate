"use client";

import React, { useMemo, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type LeadStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type Lead = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  service: string;
  assignedTo: string;
  createdOn: string;
  status: LeadStatus;
  source: string;
};

const MOCK_LEADS: Lead[] = [
  {
    id: "LD-001",
    fullName: "John Matthews",
    email: "john.m@example.com",
    phone: "+1 443-221-9954",
    service: "Website Design",
    assignedTo: "Zain Ahmed",
    createdOn: "2025-11-16T14:00:00.000Z",
    status: "New",
    source: "Website Form",
  },
  {
    id: "LD-002",
    fullName: "Sophia Turner",
    email: "sophia.t@example.com",
    phone: "+1 517-228-9982",
    service: "Branding",
    assignedTo: "Hira Khan",
    createdOn: "2025-11-14T10:22:00.000Z",
    status: "Qualified",
    source: "Facebook Ads",
  },
  {
    id: "LD-003",
    fullName: "Michael Chen",
    email: "michael.c@example.com",
    phone: "+1 646-999-5522",
    service: "Ecommerce Store",
    assignedTo: "Ali Raza",
    createdOn: "2025-11-13T09:10:00.000Z",
    status: "Proposal Sent",
    source: "Referral",
  },
  {
    id: "LD-004",
    fullName: "Aisha Rahman",
    email: "aisha.rahman@example.com",
    phone: "+92 311 5677788",
    service: "Social Media Marketing",
    assignedTo: "Zain Ahmed",
    createdOn: "2025-11-10T16:15:00.000Z",
    status: "Negotiation",
    source: "Instagram DM",
  },
  {
    id: "LD-005",
    fullName: "David Wilson",
    email: "david.w@example.com",
    phone: "+1 312-558-9044",
    service: "Mobile App",
    assignedTo: "Hira Khan",
    createdOn: "2025-11-09T12:45:00.000Z",
    status: "Closed Won",
    source: "Google Search",
  },
];

const statusColors: Record<LeadStatus, string> = {
  New: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800",
  Contacted:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800",
  Qualified:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800",
  "Proposal Sent":
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800",
  Negotiation:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
  "Closed Won":
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-100 dark:border-emerald-800",
  "Closed Lost":
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",
};

function formatDate(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function SalesLeadsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "All">("All");

  const filtered = useMemo(() => {
    let list = [...MOCK_LEADS];

    if (statusFilter !== "All") {
      list = list.filter((l) => l.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((l) => {
        return (
          l.fullName.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          l.service.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          l.assignedTo.toLowerCase().includes(q)
        );
      });
    }

    list.sort(
      (a, b) =>
        new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
    );

    return list;
  }, [search, statusFilter]);

  return (
    <ERPLayout pageTitle="Sales • Leads">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Leads
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Complete visibility into pipeline. Sales reps only see their own
              leads. Sales Manager & Admin see everything.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={() =>
              alert(
                "Lead creation form will be implemented later and connected to Firestore."
              )
            }
          >
            ＋ Add lead
          </button>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Search
            </label>
            <input
              type="text"
              placeholder="Search keyword"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="w-full md:w-44">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as LeadStatus | "All")
              }
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All statuses</option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Proposal Sent">Proposal Sent</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Closed Won">Closed Won</option>
              <option value="Closed Lost">Closed Lost</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Leads List
            </h2>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No leads found with current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-t border-slate-100 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">
                      Lead
                    </th>
                    <th className="px-4 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">
                      Service
                    </th>
                    <th className="px-4 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">
                      Assigned to
                    </th>
                    <th className="px-4 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">
                      Created
                    </th>
                    <th className="px-4 py-2 text-left text-slate-500 dark:text-slate-400 font-medium">
                      Source
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 dark:text-slate-50">
                            {lead.fullName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {lead.email} • {lead.phone}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {lead.id}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {lead.service}
                      </td>

                      <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {lead.assignedTo}
                      </td>

                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColors[lead.status]}`}
                        >
                          {lead.status}
                        </span>
                      </td>

                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        {formatDate(lead.createdOn)}
                      </td>

                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        {lead.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ERPLayout>
  );
    }
