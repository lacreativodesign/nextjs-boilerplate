"use client";

import React, { useState } from "react";

export default function HRDashboard() {
  const [dark, setDark] = useState(false);
  const [search, setSearch] = useState("");

  const theme = {
    bg: dark ? "#0A0F1C" : "#F4F7FB",
    sidebar: dark ? "#0E1629" : "#FFFFFF",
    card: dark ? "#111C34" : "#FFFFFF",
    border: dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)",
    text: dark ? "#E7ECF3" : "#0F172A",
    muted: dark ? "#9AA8BC" : "#6B7280",
    brand: "#06B6D4",
    accent: "#6366F1",
    radius: 14,
  };

  const employees = [
    {
      id: "EMP-001",
      name: "Sarah Mitchell",
      role: "Sales Team Lead",
      manager: "N/A",
      status: "Active",
      joined: "2023-11-10",
    },
    {
      id: "EMP-002",
      name: "Ali Raza",
      role: "Sales Executive",
      manager: "Sarah Mitchell",
      status: "Active",
      joined: "2024-02-14",
    },
    {
      id: "EMP-003",
      name: "Kiran Shah",
      role: "Account Manager",
      manager: "N/A",
      status: "Active",
      joined: "2024-04-03",
    },
    {
      id: "EMP-004",
      name: "John Parker",
      role: "UI/UX Designer",
      manager: "Kiran Shah",
      status: "Inactive",
      joined: "2023-09-20",
    },
  ];

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(search.toLowerCase()) ||
    emp.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: theme.bg,
        color: theme.text,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: 240,
          background: theme.sidebar,
          padding: "26px 18px",
          borderRight: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: theme.brand, marginBottom: 28 }}>
          HR PORTAL
        </div>

        {["Overview", "Employees", "Onboarding", "Performance", "Documents", "Reports"].map(
          (item) => (
            <div
              key={item}
              style={{
                padding: "10px 12px",
                marginBottom: 6,
                cursor: "pointer",
                borderRadius: 10,
                color: theme.muted,
                fontWeight: 600,
              }}
            >
              {item}
            </div>
          )
        )}

        <button
          onClick={() => setDark(!dark)}
          style={{
            marginTop: 30,
            width: "100%",
            padding: "10px",
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: "transparent",
            cursor: "pointer",
            color: theme.text,
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* MAIN AREA */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Employees</h1>

        {/* TOP CARDS */}
        <div style={{ display: "flex", gap: 20, marginBottom: 26, flexWrap: "wrap" }}>
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: theme.radius,
              border: `1px solid ${theme.border}`,
              width: 200,
            }}
          >
            <div style={{ fontSize: 14, color: theme.muted }}>Total Employees</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{employees.length}</div>
          </div>

          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: theme.radius,
              border: `1px solid ${theme.border}`,
              width: 200,
            }}
          >
            <div style={{ fontSize: 14, color: theme.muted }}>Active</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>
              {employees.filter((e) => e.status === "Active").length}
            </div>
          </div>

          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: theme.radius,
              border: `1px solid ${theme.border}`,
              width: 200,
            }}
          >
            <div style={{ fontSize: 14, color: theme.muted }}>Inactive</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>
              {employees.filter((e) => e.status === "Inactive").length}
            </div>
          </div>
        </div>

        {/* SEARCH */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees..."
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: dark ? "#0F1A2F" : "#fff",
            marginBottom: 20,
            color: theme.text,
          }}
        />

        {/* TABLE */}
        <div
          style={{
            background: theme.card,
            borderRadius: theme.radius,
            border: `1px solid ${theme.border}`,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: dark ? "#0F192C" : "#F3F4F6", textAlign: "left" }}>
                {["ID", "Name", "Role", "Manager", "Status", "Joined"].map((h) => (
                  <th key={h} style={{ padding: 14, fontSize: 13, color: theme.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: 14 }}>{emp.id}</td>
                  <td style={{ padding: 14 }}>{emp.name}</td>
                  <td style={{ padding: 14 }}>{emp.role}</td>
                  <td style={{ padding: 14 }}>{emp.manager}</td>
                  <td style={{ padding: 14 }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 20,
                        background:
                          emp.status === "Active" ? "rgba(16,185,129,0.18)" : "rgba(244,63,94,0.18)",
                        color: emp.status === "Active" ? "#10B981" : "#F43F5E",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {emp.status}
                    </span>
                  </td>
                  <td style={{ padding: 14 }}>{emp.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
