"use client";

import React, { useMemo, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type LeadStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  value: number; // in USD
  stage: LeadStage;
  source: string;
  owner: string;
  lastActivity: string; // ISO date
};

const MOCK_LEADS: Lead[] = [
  {
    id: "L-1001",
    name: "Sarah Johnson",
    company: "Northbridge Realty",
    email: "sarah.johnson@example.com",
    value: 4800,
    stage: "Proposal Sent",
    source: "Website Form",
    owner: "You",
    lastActivity: "2025-11-15T10:30:00.000Z",
  },
  {
    id: "L-1002",
    name: "David Miller",
    company: "Evercrest Fitness",
    email: "david.miller@example.com",
    value: 7200,
    stage: "Negotiation",
    source: "Referral",
    owner: "You",
    lastActivity: "2025-11-16T14:10:00.000Z",
  },
  {
    id: "L-1003",
    name: "Emily Clark",
    company: "Brightwood Publishing",
    email: "emily.clark@example.com",
    value: 3200,
    stage: "Qualified",
    source: "LinkedIn",
    owner: "You",
    lastActivity: "2025-11-14T09:05:00.000Z",
  },
  {
    id: "L-1004",
    name: "Marcus Lee",
    company: "Atlas Legal Group",
    email: "marcus.lee@example.com",
    value: 10500,
    stage: "Closed Won",
    source: "Email Campaign",
    owner: "You",
    lastActivity: "2025-11-10T16:40:00.000Z",
  },
];

const PIPELINE_ORDER: LeadStage[] = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "$0";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function SalesDashboardPage() {
  const [stageFilter, setStageFilter] = useState<LeadStage | "All">("All");
  const [search, setSearch] = useState("");

  const filteredLeads = useMemo(() => {
    let list = [...MOCK_LEADS];

    if (stageFilter !== "All") {
      list = list.filter((l) => l.stage === stageFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((l) => {
        return (
          l.name.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q)
        );
      });
    }

    // Sort by last activity desc
    list.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime()
    );

    return list;
  }, [stageFilter, search]);

  const summary = useMemo(() => {
    const myLeads = MOCK_LEADS; // all are "You" for now

    const totalLeads = myLeads.length;
    const activeStages: LeadStage[] = [
      "New Lead",
      "Contacted",
      "Qualified",
      "Proposal Sent",
      "Negotiation",
    ];
    const activeLeads = myLeads.filter((l) =>
      activeStages.includes(l.stage)
    ).length;

    const pipelineValue = myLeads
      .filter((l) => activeStages.includes(l.stage))
      .reduce((sum, l) => sum + l.value, 0);

    const closedWonValue = myLeads
      .filter((l) => l.stage === "Closed Won")
      .reduce((sum, l) => sum + l.value, 0);

    return {
      totalLeads,
      activeLeads,
      pipelineValue,
      closedWonValue,
    };
  }, []);

  const pipelineByStage = useMemo(() => {
    const map: Record<
      LeadStage,
      { count: number; value: number }
    > = {
      "New Lead": { count: 0, value: 0 },
      Contacted: { count: 0, value: 0 },
      Qualified: { count: 0, value: 0 },
      "Proposal Sent": { count: 0, value: 0 },
      Negotiation: { count: 0, value: 0 },
      "Closed Won": { count: 0, value: 0 },
      "Closed Lost": { count: 0, value: 0 },
    };

    MOCK_LEADS.forEach((l) => {
      map[l.stage].count += 1;
      map[l.stage].value += l.value;
    });

    return map;
  }, []);

  return (
    <ERPLayout pageTitle="Sales • Overview">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              My Sales Performance
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Quick view of your leads, pipeline, and closed revenue inside
              La Creativo ERP.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Stage filter
              </label>
              <select
                value={stageFilter}
                onChange={(e) =>
                  setStageFilter(e.target.value as LeadStage | "All")
                }
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
              >
                <option value="All">All stages</option>
                {PIPELINE_ORDER.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Search (name / company / email)
              </label>
              <input
                type="text"
                placeholder="Type to filter leads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
              />
            </div>
          </div>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              My Leads
            </span>
            <span className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {summary.totalLeads}
            </span>
            <span className="text-[11px] text-slate-400">
              Total leads currently assigned to you.
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Active in Pipeline
            </span>
            <span className="text-2xl font-semibold text-amber-900 dark:text-amber-50">
              {summary.activeLeads}
            </span>
            <span className="text-[11px] text-amber-700/70 dark:text-amber-200/70">
              New, contacted, qualified, proposal, or negotiation.
            </span>
          </div>

          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Pipeline Value
            </span>
            <span className="text-2xl font-semibold text-indigo-900 dark:text-indigo-50">
              {formatCurrency(summary.pipelineValue)}
            </span>
            <span className="text-[11px] text-indigo-700/70 dark:text-indigo-200/70">
              Expected value of all active deals.
            </span>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Closed Won (Sample)
            </span>
            <span className="text-2xl font-semibold text-emerald-900 dark:text-emerald-50">
              {formatCurrency(summary.closedWonValue)}
            </span>
            <span className="text-[11px] text-emerald-700/70 dark:text-emerald-200/70">
              Closed deals in this mock dataset.
            </span>
          </div>
        </div>

        {/* Pipeline mini-board */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Pipeline snapshot
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Simple count and value in each stage (sample data for now).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3 text-xs">
            {PIPELINE_ORDER.map((stage) => {
              const item = pipelineByStage[stage];
              const isWon = stage === "Closed Won";
              const isLost = stage === "Closed Lost";
              const isActive =
                stage === "New Lead" ||
                stage === "Contacted" ||
                stage === "Qualified" ||
                stage === "Proposal Sent" ||
                stage === "Negotiation";

              let badgeClass =
                "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
              if (isActive) {
                badgeClass =
                  "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200";
              }
              if (isWon) {
                badgeClass =
                  "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200";
              }
              if (isLost) {
                badgeClass =
                  "bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200";
              }

              return (
                <div
                  key={stage}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {stage}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                    >
                      {item.count} lead{item.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.value > 0
                      ? `${formatCurrency(item.value)} in deals`
                      : "No deals here yet."}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leads table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                My leads
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                This is the Sales view for your own leads. Later we&apos;ll
                connect this to live data and the CRM pipeline.
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => {
                alert(
                  "New Lead form will live here in the next iteration. For now this is UI-only."
                );
              }}
            >
              ＋ Add new lead
            </button>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No leads match your current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-t border-slate-100 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Lead
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Company
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Stage
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Value
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Source
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Last activity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-slate-50 font-medium">
                            {lead.name}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {lead.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {lead.company}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/40">
                          {lead.stage}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-900 dark:text-slate-50">
                        {formatCurrency(lead.value)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                        {lead.source}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                        {new Date(lead.lastActivity).toLocaleString(undefined, {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
