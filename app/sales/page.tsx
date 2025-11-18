// app/sales/page.tsx
"use client";

export default function SalesOverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Sales Team 🚀
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Track leads, performance metrics, and revenue growth — all in one place.
      </p>

      {/* Sales Grid */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Leads</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View, track and manage all incoming leads in your pipeline.
          </p>
        </div>

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
            Convert leads and manage client interactions seamlessly.
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
            Analyze conversions, response time, and revenue metrics.
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
            Generate monthly, quarterly or annual sales reports.
          </p>
        </div>
      </div>
    </>
  );
            }
