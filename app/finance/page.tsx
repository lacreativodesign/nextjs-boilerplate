"use client";
import RequireAuth from "@/components/RequireAuth";
import { useMemo, useState } from "react";

type Invoice = {
  id: string;
  client: string;
  amount: number;
  status: "Paid" | "Unpaid" | "Overdue";
  date: string;
};

type Payment = {
  id: string;
  client: string;
  amount: number;
  method: string;
  date: string;
};

type PayrollItem = {
  id: string;
  name: string;
  role: string;
  salary: number;
  lastPaid: string;
};

export default function FinancePage() {
  const [dark, setDark] = useState(false);

  const t = useMemo(
    () => ({
      bg: dark ? "#0F172A" : "#F8FAFC",
      text: dark ? "#E6EEF7" : "#0F172A",
      card: dark ? "#162035" : "#FFFFFF",
      sidebar: dark ? "#0B1224" : "#F1F5F9",
      border: dark ? "#2A3A57" : "#E2E8F0",
      muted: dark ? "#94A3B8" : "#475569",
      brand: "#06B6D4",
      chip: dark ? "rgba(2,132,199,.2)" : "rgba(6,182,212,.1)",
    }),
    [dark]
  );

  // Dummy Data
  const INVOICES: Invoice[] = [
    { id: "INV-001", client: "Redroot Café", amount: 899, status: "Paid", date: "2025-10-15" },
    { id: "INV-002", client: "Northbridge Studio", amount: 1499, status: "Unpaid", date: "2025-10-22" },
    { id: "INV-003", client: "Evercrest Books", amount: 2499, status: "Overdue", date: "2025-09-30" },
  ];

  const PAYMENTS: Payment[] = [
    { id: "PAY-101", client: "Redroot Café", amount: 899, method: "Credit Card", date: "2025-10-16" },
    { id: "PAY-102", client: "Bluewave Tech", amount: 1299, method: "Bank Transfer", date: "2025-10-12" },
  ];

  const PAYROLL: PayrollItem[] = [
    { id: "HR-201", name: "Ayesha Khan", role: "AM", salary: 1200, lastPaid: "2025-10-05" },
    { id: "HR-202", name: "Bilal Ahmed", role: "Frontend Dev", salary: 1500, lastPaid: "2025-10-08" },
  ];

  function exportInvoices() {
    const header = "id,client,amount,status,date\n";
    const rows = INVOICES.map((i) =>
      [i.id, i.client, i.amount, i.status, i.date].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoices.csv";
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <RequireAuth allowed={["finance"]}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: t.bg,
          color: t.text,
          fontFamily: "Inter, ui-sans-serif, system-ui",
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: 240,
            background: t.sidebar,
            borderRight: `1px solid ${t.border}`,
            padding: "26px 18px",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: t.brand }}>
            FINANCE
          </div>

          {["Overview", "Invoices", "Payments", "Payroll", "Reports", "Settings", "Profile"].map(
            (item) => (
              <div
                key={item}
                style={{
                  padding: "10px 12px",
                  marginBottom: 6,
                  cursor: "pointer",
                  borderRadius: 10,
                  color: t.muted,
                  fontWeight: 600,
                }}
              >
                {item}
              </div>
            )
          )}

          <button
            onClick={() => setDark(!dark)}
            style={{
              marginTop: 30,
              width: "100%",
              padding: "10px",
              background: "transparent",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              cursor: "pointer",
              color: t.text,
            }}
          >
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Finance Dashboard</h1>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 30 }}>
            {[
              { label: "Total Invoices", value: INVOICES.length },
              { label: "Unpaid", value: INVOICES.filter((i) => i.status === "Unpaid").length },
              { label: "Overdue", value: INVOICES.filter((i) => i.status === "Overdue").length },
              { label: "Payments (30d)", value: PAYMENTS.length },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  borderRadius: 16,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, color: t.muted }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* INVOICES */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
              marginBottom: 30,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Invoices</h2>

              <button
                onClick={exportInvoices}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: "transparent",
                  cursor: "pointer",
                  color: t.text,
                }}
              >
                Export CSV
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr style={{ background: t.chip }}>
                    {["ID", "Client", "Amount", "Status", "Date"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "12px 14px",
                          borderBottom: `1px solid ${t.border}`,
                          fontSize: 12,
                          color: t.muted,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {INVOICES.map((inv) => (
                    <tr key={inv.id}>
                      <td style={td(t)}>{inv.id}</td>
                      <td style={td(t)}>{inv.client}</td>
                      <td style={td(t)}>${inv.amount}</td>
                      <td style={td(t)}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: t.chip,
                            border: `1px solid ${t.border}`,
                            fontSize: 12,
                          }}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td style={td(t)}>{inv.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* PAYMENTS */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Payments</h2>

            {PAYMENTS.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                }}
              >
                <div>{p.client}</div>
                <div>${p.amount}</div>
                <div>{p.method}</div>
                <div style={{ fontSize: 13, color: t.muted }}>{p.date}</div>
              </div>
            ))}
          </section>

          {/* PAYROLL */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Payroll</h2>

            {PAYROLL.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                }}
              >
                <div>{p.name}</div>
                <div>{p.role}</div>
                <div>${p.salary}</div>
                <div style={{ fontSize: 13, color: t.muted }}>{p.lastPaid}</div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </RequireAuth>
  );
}

function td(t: any): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderBottom: `1px solid ${t.border}`,
    fontSize: 14,
  };
            }
