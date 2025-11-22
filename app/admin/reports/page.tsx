"use client";

import { useState } from "react";

type TabKey = "sales" | "clients" | "projects" | "finance" | "team";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("sales");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "sales", label: "Sales Reports" },
    { key: "clients", label: "Client Reports" },
    { key: "projects", label: "Project Reports" },
    { key: "finance", label: "Finance Reports" },
    { key: "team", label: "Team Productivity" },
  ];

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        Reports & Analytics
      </h2>

      {/* HORIZONTAL TABS */}
      <div
        style={{
          display: "flex",
          gap: 24,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "transparent",
                border: "none",
                padding: "10px 0",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: isActive ? 700 : 500,
                borderBottom: isActive
                  ? "3px solid #2563eb"
                  : "3px solid transparent",
                color: isActive ? "#111827" : "var(--sidebar-text)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
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
    </div>
  );
}

/* ================= TAB SECTIONS ================= */

function SalesReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Sales Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Sales performance, conversion rates, pipeline analytics.
      </p>
    </div>
  );
}

function ClientReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Client Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Churn, retention, satisfaction and client segmentation metrics.
      </p>
    </div>
  );
}

function ProjectReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Project Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        On-time delivery stats and project workload analytics.
      </p>
    </div>
  );
}

function FinanceReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Finance Reports
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Revenue, cashflow, AR aging and monthly recurring revenue.
      </p>
    </div>
  );
}

function TeamReports() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Team Productivity
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Productivity, workload, and operational efficiency by role/department.
      </p>
    </div>
  );
              }
