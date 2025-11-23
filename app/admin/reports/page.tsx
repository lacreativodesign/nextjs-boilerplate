"use client";

import { useState } from "react";

type TabKey =
  | "sales"
  | "clients"
  | "projects"
  | "finance"
  | "team";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("sales");

  const tabs = [
    { key: "sales", label: "Sales Reports" },
    { key: "clients", label: "Client Reports" },
    { key: "projects", label: "Project Reports" },
    { key: "finance", label: "Finance Reports" },
    { key: "team", label: "Team Performance" },
  ];

  return (
    <div>
      {/* LEAVE SPACE FOR BLUE PILLS (layout handles tabs) */}
      <div style={{ marginBottom: 20 }} />

      {/* CONTENT WRAPPER */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "sales" && <SalesReports />}
        {activeTab === "clients" && <ClientReports />}
        {activeTab === "projects" && <ProjectReports />}
        {activeTab === "finance" && <FinanceReports />}
        {activeTab === "team" && <TeamReports />}
      </div>

      {/* BLUE TABS */}
      <ReportTabs activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs} />
    </div>
  );
}

/* =======================================================
                      BLUE TAB COMPONENT
   ======================================================= */

function ReportTabs({
  activeTab,
  setActiveTab,
  tabs,
}: {
  activeTab: string;
  setActiveTab: (t: any) => void;
  tabs: { key: string; label: string }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        borderBottom: "1px solid var(--border)",
        marginBottom: 20,
        marginTop: -70,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeTab;

        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              active
                ? "bg-blue-600 text-white px-4 py-2 rounded-t-md font-semibold"
                : "text-gray-700 dark:text-gray-300 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-t-md"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* =======================================================
                      TAB SECTIONS
   ======================================================= */

function SalesReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Sales Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        KPIs: conversion rates, lead sources, pipeline performance, revenue.
      </p>
    </div>
  );
}

function ClientReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Client Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Churn rate, retention, satisfaction, client lifecycle insights.
      </p>
    </div>
  );
}

function ProjectReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Project Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Project status, on-time delivery, revision counts, AM performance.
      </p>
    </div>
  );
}

function FinanceReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Finance Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Revenue, AR, recurring revenue, financial insights.
      </p>
    </div>
  );
}

function TeamReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Team Performance
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Workload, productivity, performance insights.
      </p>
    </div>
  );
}
