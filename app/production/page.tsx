// app/production/page.tsx
"use client";

export default function ProductionOverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Production Team 🛠️
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Track active tasks, manage project files, and stay aligned with
        delivery timelines.
      </p>

      {/* Production Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Active Queue */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Active Queue</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Review projects in the production pipeline and update statuses.
          </p>
        </div>

        {/* Files Management */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Files Management</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Upload drafts, revisions, and final deliverables for client approval.
          </p>
        </div>

        {/* Activity Log */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Activity Log</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track changes, progress notes, and communication from AM & clients.
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
            Review workload, delivery timelines, and production performance
            insights.
          </p>
        </div>
      </div>
    </>
  );
        }
