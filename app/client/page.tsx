"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function ClientDashboard() {
  return (
    <ERPLayout role="client" title="Client Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome to Your Client Portal 🤝
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Track project progress, view deliverables, invoices, and collaborate seamlessly.
      </p>

      {/* Client Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Projects</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View progress, milestones, files, and project updates.
          </p>
        </div>

        {/* Deliverables */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Deliverables</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Access drafts, revisions, and final files shared by your team.
          </p>
        </div>

        {/* Invoices */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Invoices</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View and download your invoices, receipts, and payment history.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Messages</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Chat with your project manager and track communication threads.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
}
