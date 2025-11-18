// app/am/page.tsx
"use client";

export default function AMOverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Account Manager 🎧
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage active clients, project communication, and delivery cycles in one place.
      </p>

      {/* AM GRID CARDS */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Clients</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Handle client onboarding, profiles, notes, and conversations.
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
            Track all project progress and coordinate with clients & production.
          </p>
        </div>

        {/* Chat */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Chat</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Real-time messaging with clients & internal team members.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Files</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Manage drafts, revisions, and final deliverables.
          </p>
        </div>

        {/* Reports */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Reports</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Review performance, timelines, and communication analytics.
          </p>
        </div>
      </div>
    </>
  );
}
