"use client";

export default function ClientsPage() {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Clients
      </h3>

      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 16,
        }}
      >
        This table will show every client with status, AM assigned and quick actions.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th style={{ padding: "8px 4px" }}>Client</th>
              <th style={{ padding: "8px 4px" }}>Company</th>
              <th style={{ padding: "8px 4px" }}>AM Assigned</th>
              <th style={{ padding: "8px 4px" }}>Status</th>
              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>ACME Corp</td>
              <td style={{ padding: "8px 4px" }}>acme.com</td>
              <td style={{ padding: "8px 4px" }}>Sarah Khan</td>
              <td style={{ padding: "8px 4px" }}>Active</td>
              <td style={{ padding: "8px 4px" }}>
                <button
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "#f3f4f6",
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
              }
