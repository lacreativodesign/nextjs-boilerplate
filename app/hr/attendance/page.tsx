"use client";

import React from "react";

export default function HRAttendancePage() {
  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "Inter, sans-serif",
        color: "#111827",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "10px" }}>
        Attendance
      </h1>

      <p style={{ color: "#6b7280", marginBottom: "30px" }}>
        This screen will show daily login attendance for every employee.
      </p>

      <div
        style={{
          padding: "40px",
          borderRadius: "12px",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "10px" }}>
          Attendance Table Coming Soon
        </h2>
        <p style={{ color: "#6b7280" }}>
          Once the backend connection is added, you’ll see:
          <br />
          – Daily attendance
          <br />
          – Login times
          <br />
          – Late arrivals
          <br />
          – Absentees
          <br />
          – Per-user attendance history
        </p>
      </div>
    </div>
  );
}
