"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";

type PayrollRow = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  hourlyRate: number;
  hours: number;
  salary: number;
};

export const dynamic = "force-dynamic";

export default function PayrollSummary() {
  const [month, setMonth] = useState(dayjs());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function loadPayroll() {
    try {
      setLoading(true);
      const res = await fetch(`/api/hr/payroll?month=${month.format("YYYY-MM")}`);
      const data = await res.json();

      if (data.success) {
        setRows(data.rows);
      }
    } catch (err) {
      console.error("Payroll fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  const btn = {
    padding: "8px 14px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  };

  const th: React.CSSProperties = {
    padding: 12,
    fontSize: 13,
    fontWeight: 700,
    borderBottom: "1px solid #e5e7eb",
    textAlign: "left",
  };

  const td: React.CSSProperties = {
    padding: 12,
    fontSize: 14,
    borderBottom: "1px solid #f3f4f6",
  };

  return (
    <div className="space-y-6">
      {/* TOP BAR */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>
          Payroll — {month.format("MMMM YYYY")}
        </h2>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMonth(month.subtract(1, "month"))} style={btn}>
            Prev
          </button>
          <button onClick={() => setMonth(dayjs())} style={btn}>
            Current
          </button>
          <button onClick={() => setMonth(month.add(1, "month"))} style={btn}>
            Next
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "white",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>Employee</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Hourly Rate</th>
              <th style={th}>Hours</th>
              <th style={th}>Total Salary</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  No attendance found for this month.
                </td>
              </tr>
            )}

            {rows.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: "pointer" }}
                onClick={() => (window.location.href = `/hr/attendance/${r.id}`)}
              >
                <td style={td}>{r.name}</td>
                <td style={td}>{r.email || "-"}</td>
                <td style={td}>{r.role || "-"}</td>
                <td style={td}>${r.hourlyRate}</td>
                <td style={td}>{r.hours}</td>
                <td style={td}>= ${r.salary.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
