// app/client/page.tsx
"use client";

export default function ClientOverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome to Your Dashboard
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Access your projects, invoices, files, and communication — everything in one place.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Projects</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View all ongoing and completed project deliverables.
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
            Access drafts, revisions, final versions, and shared assets.
          </p>
        </div>

        {/* Billing */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Billing & Invoices</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View invoices, payment history, and pending payments.
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
            Communicate with your Account Manager in real-time.
          </p>
        </div>

        {/* Profile */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Profile</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Update personal information and account settings.
          </p>
        </div>
      </div>
    </>
  );
}
