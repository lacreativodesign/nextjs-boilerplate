// app/hr/page.tsx
"use client";

export default function HROverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        HR Overview
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage employees, attendance, leaves, and internal oversight.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Employees */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Employees</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View, add, update, and manage employee profiles.
          </p>
        </div>

        {/* Attendance */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Attendance</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track login/logout logs and working hours.
          </p>
        </div>

        {/* Leave Requests */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Leave Requests</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Approve or reject employee leave submissions.
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
            View employee activity across all departments.
          </p>
        </div>

        {/* HR Reports */}
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
            Review attendance, performance, and HR metrics.
          </p>
        </div>
      </div>
    </>
  );
}
