"use client";

import { useState } from "react";

type TabKey = "all" | "add" | "key" | "segments";

export default function ClientsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Clients" },
    { key: "add", label: "Add Client" },
    { key: "key", label: "Key Accounts" },
    { key: "segments", label: "Client Segments" },
  ];

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        Client Management
      </h2>

      {/* HORIZONTAL TABS — UNIVERSAL LAYOUT */}
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

      {/* CONTENT BOX */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "all" && <AllClients />}
        {activeTab === "add" && <AddClient />}
        {activeTab === "key" && <KeyAccounts />}
        {activeTab === "segments" && <ClientSegments />}
      </div>
    </div>
  );
}

/* =======================================================
                      TAB SECTIONS
   ======================================================= */

function AllClients() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Clients
      </h3>
      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 16,
        }}
      >
        This table will show every client with status, AM assigned and quick actions.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th style={{ padding: "8px 4px" }}>Client</th>
              <th style={{ padding: "8px 4px" }}>Company</th>
              <th style={{ padding: "8px 4px" }}>AM Assigned</th>
              <th style={{ padding: "8px 4px" }}>Status</th>
              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>ACME Corp</td>
              <td style={{ padding: "8px 4px" }}>acme.com</td>
              <td style={{ padding: "8px 4px" }}>Sarah Khan</td>
              <td style={{ padding: "8px 4px" }}>Active</td>
              <td style={{ padding: "8px 4px" }}>
                <button
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "#f3f4f6",
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddClient() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Add New Client
      </h3>
      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 16,
        }}
      >
        Fill in the details below to register a new client.
      </p>

      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <Input label="Client Name" placeholder="Client full name" />
        <Input label="Company" placeholder="Company name" />
        <Input label="Email" placeholder="client@company.com" type="email" />
        <Input label="Website" placeholder="https://company.com" />
        <Input label="Phone" placeholder="+123456789" />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Account Manager</label>
          <select
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          >
            <option>Select AM</option>
            <option>Sarah Khan</option>
            <option>John Doe</option>
          </select>
        </div>
      </form>

      <button
        type="button"
        style={{
          marginTop: 20,
          padding: "10px 18px",
          borderRadius: 8,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Save Client (wire to API later)
      </button>
    </div>
  );
}

function KeyAccounts() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Key Accounts
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        These are your top-priority high-value clients (retainers & enterprise level).
      </p>
    </div>
  );
}

function ClientSegments() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Client Segments
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Different segments like Web-Only, Branding + Web, Retainers, Dormant, etc.
      </p>
    </div>
  );
}

/* INPUT COMPONENT */
function Input({ label, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--page-bg)",
        }}
      />
    </div>
  );
        }
