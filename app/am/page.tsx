"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function AMDashboard() {
  return (
    <ERPLayout role="am" title="Account Manager Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Account Manager Overview 🧩
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage client communication, track project updates, and stay on top of deliverables.
      </p>

      {/* AM Dashboard Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Clients */}
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
            View and manage all clients assigned to you.
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
            Track project status, escalate delays, and update clients.
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
            Communicate with clients & production in real-time.
          </p>
        </div>

        {/* Deliverables Review */}
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
            Approve drafts, track revisions, and share updates with clients.
          </p>
        </div>

        {/* Escalations */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Escalations</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Escalate production issues directly to management.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
}
