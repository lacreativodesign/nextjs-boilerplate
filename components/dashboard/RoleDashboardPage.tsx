import React from "react";

type Props = {
  heading: string;
  subtitle: string;
  kpis: string[];
  tableTitle: string;
};

export default function RoleDashboardPage({ heading, subtitle, kpis, tableTitle }: Props) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>{heading}</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>{subtitle}</p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {kpis.slice(0, 4).map((label) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>—</div>
          </div>
        ))}
      </section>

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>{tableTitle}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 0" }}>Item</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 0" }}>Status</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 0" }}>Owner</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((row) => (
              <tr key={row}>
                <td style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>Placeholder row {row}</td>
                <td style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>Pending</td>
                <td style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>System</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Recent Activity</h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#374151" }}>
          <li>Demo activity item one.</li>
          <li>Demo activity item two.</li>
          <li>Demo activity item three.</li>
        </ul>
      </section>
    </div>
  );
}
