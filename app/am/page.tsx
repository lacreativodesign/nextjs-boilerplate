"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function AMDashboard() {
  return (
    <ERPLayout role="am" title="Account Manager Dashboard">

      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Account Manager 👋
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage clients, oversee projects, coordinate with production, and ensure delivery quality.
      </p>

      {/* Dashboard Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* My Clients */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Clients</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View, track, and manage all clients assigned to you.
          </p>
        </div>

        {/* Projects */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Projects</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Monitor project timelines, deliverables, drafts, and revisions.
          </p>
        </div>

        {/* Messages */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Client Messages</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Communicate with clients & coordinate feedback in real time.
          </p>
        </div>

        {/* Files */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Project Files</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Upload and manage drafts, revisions, and final deliverables.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
}
