"use client";

import React from "react";

export default function SalesOverviewPage() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Sales Overview
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Track your leads, proposals, follow-ups, and closed deals in one unified view.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        {/* Pipeline Snapshot */}
        <div
          style={{
            padding: 20,
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Pipeline Snapshot</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            See how many deals are in New Lead, Qualified, Proposal, and Negotiation stages.
          </p>
        </div>

        {/* Active Leads */}
        <div
          style={{
            padding: 20,
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Active Leads</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Quickly scan hot and warm leads that need follow-up today.
          </p>
        </div>

        {/* Follow-Ups */}
        <div
          style={{
            padding: 20,
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Follow-Ups</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Stay on top of callbacks, demos, and proposal reminders.
          </p>
        </div>

        {/* Revenue Summary */}
        <div
          style={{
            padding: 20,
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Revenue Summary</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            See closed-won value this month versus target at a glance.
          </p>
        </div>
      </div>
    </div>
  );
}
