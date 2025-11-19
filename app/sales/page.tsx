"use client";

export default function SalesOverview() {
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
          marginTop: 20,
        }}
      >
        {/* Leads */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Leads</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Review all leads assigned to you across all pipeline stages.
          </p>
        </div>

        {/* Follow Ups */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Follow Ups</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Stay on top of client calls, emails, and WhatsApp follow-ups.
          </p>
        </div>

        {/* Proposal Sent */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Proposal Stage</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View all active proposals waiting for feedback or negotiation.
          </p>
        </div>

        {/* Deals */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Closed Deals</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Review your closed wins and their revenue contribution.
          </p>
        </div>

        {/* Performance */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Performance</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track conversion rates, calls, demos, proposals, wins & more.
          </p>
        </div>
      </div>
    </div>
  );
            }
