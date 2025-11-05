"use client";
import RequireAuth from "@/components/RequireAuth";
import { useMemo, useState } from "react";

type Employee = {
  id: string;
  name: string;
  role: string;
  email: string;
  status: "Active" | "Onboarding" | "Probation" | "Inactive";
};

type OnboardItem = {
  id: string;
  name: string;
  position: string;
  checklistDone: number; // 0-100
  startDate: string;
};

type PerfItem = {
  id: string;
  name: string;
  role: string;
  score: number; // 0-100
  period: string;
};

export default function HRPage() {
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

  // ===== Dummy data =====
  const EMPLOYEES: Employee[] = [
    { id: "E-101", name: "Ayesha Khan", role: "Account Manager", email: "ayesha@lacreativo.com", status: "Active" },
    { id: "E-102", name: "Bilal Ahmed", role: "Frontend Dev", email: "bilal@lacreativo.com", status: "Probation" },
    { id: "E-103", name: "Sara Iqbal", role: "Designer", email: "sara@lacreativo.com", status: "Active" },
    { id: "E-104", name: "Hamza Ali", role: "Project Coordinator", email: "hamza@lacreativo.com", status: "Onboarding" },
  ];

  const ONBOARDING: OnboardItem[] = [
    { id: "O-201", name: "Ali Raza", position: "Sales Executive", checklistDone: 60, startDate: "2025-11-03" },
    { id: "O-202", name: "Maryam Noor", position: "UI Designer", checklistDone: 35, startDate: "2025-11-10" },
  ];

  const PERFORMANCE: PerfItem[] = [
    { id: "P-301", name: "Ayesha Khan", role: "Account Manager", score: 87, period: "Q4 2025" },
    { id: "P-302", name: "Bilal Ahmed", role: "Frontend Dev", score: 74, period: "Q4 2025" },
    { id: "P-303", name: "Sara Iqbal", role: "Designer", score: 91, period: "Q4 2025" },
  ];

  const DOCS = [
    { id: "D-401", title: "HR Policy - 2025", type: "PDF", updated: "2025-10-18" },
    { id: "D-402", title: "Leave Policy", type: "PDF", updated: "2025-09-02" },
    { id: "D-403", title: "Onboarding Handbook", type: "DOCX", updated: "2025-08-12" },
  ];

  const ACTIVITY = [
    { id: "A-501", when: "Today 11:22", text: "Created onboarding checklist for Ali Raza" },
    { id: "A-502", when: "Yesterday 17:40", text: "Updated HR Policy - 2025" },
    { id: "A-503", when: "Nov 2, 09:05", text: "Marked Sara Iqbal performance review complete" },
  ];

  function exportEmployeesCSV() {
    const header = "id,name,role,email,status\n";
    const rows = EMPLOYEES.map(e => [e.id, e.name, e.role, e.email, e.status].join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees.csv";
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function markOnboardingComplete(id: string) {
    alert(`Stub: mark onboarding ${id} as complete (wire to Firestore later).`);
  }

  function openDoc(id: string) {
    alert(`Stub: open doc ${id} viewer (Uploadcare/Storage later).`);
  }

  return (
    <RequireAuth allowed={["hr"]}>
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
            HR PORTAL
          </div>

          {["Overview", "Employees", "Onboarding", "Performance", "Documents", "Activity", "Reports", "Profile"].map(
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>HR Dashboard</h1>

          {/* TOP STRIP (KPIs) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Employees", value: EMPLOYEES.length },
              { label: "Onboarding", value: ONBOARDING.length },
              { label: "Docs", value: DOCS.length },
              { label: "Reviews (Q4)", value: PERFORMANCE.length },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, color: t.muted }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* EMPLOYEES */}
          <section
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Employees</h2>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={exportEmployeesCSV}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: "transparent",
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  Export CSV
                </button>
                <button
                  onClick={() => alert("Stub: Add Employee modal (wire later).")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: t.brand,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  + Add
                </button>
              </div>
            </div>

            <div
              style={{
                overflowX: "auto",
                border: `1px solid ${t.border}`,
                borderRadius: 12,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ background: t.chip }}>
                    {["ID", "Name", "Role", "Email", "Status"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "12px 14px",
                          fontSize: 12,
                          color: t.muted,
                          borderBottom: `1px solid ${t.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EMPLOYEES.map((e) => (
                    <tr key={e.id}>
                      <td style={td(t)}>{e.id}</td>
                      <td style={td(t)}>{e.name}</td>
                      <td style={td(t)}>{e.role}</td>
                      <td style={td(t)}>{e.email}</td>
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
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ONBOARDING */}
          <section
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Onboarding</h2>
            {ONBOARDING.map((o) => (
              <div
                key={o.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr 160px",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{o.name}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>{o.position}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: t.muted, marginBottom: 6 }}>Checklist</div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: dark ? "#0B1224" : "#EDF2F7",
                      overflow: "hidden",
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: `${o.checklistDone}%`,
                        height: "100%",
                        background: t.brand,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: t.muted }}>Start</div>
                  <div>{o.startDate}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => markOnboardingComplete(o.id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#10B981",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Mark Complete
                  </button>
                  <button
                    onClick={() => alert("Stub: open onboarding record")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: "transparent",
                      color: t.text,
                      cursor: "pointer",
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* PERFORMANCE */}
          <section
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Performance</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {PERFORMANCE.map((p) => (
                <div
                  key={p.id}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: t.muted, marginBottom: 10 }}>{p.role}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>{p.period}</div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: t.muted, marginBottom: 6 }}>Score</div>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: dark ? "#0B1224" : "#EDF2F7",
                        overflow: "hidden",
                        border: `1px solid ${t.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: `${p.score}%`,
                          height: "100%",
                          background: "#6366F1",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* DOCUMENTS */}
          <section
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Documents</h2>
              <button
                onClick={() => alert("Stub: Upload (Uploadcare)")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: t.brand,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                + Upload
              </button>
            </div>

            {DOCS.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 100px 160px 120px",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 700 }}>{d.title}</div>
                <div style={{ fontSize: 13, color: t.muted }}>{d.type}</div>
                <div style={{ fontSize: 13, color: t.muted }}>Updated {d.updated}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openDoc(d.id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: "transparent",
                      color: t.text,
                      cursor: "pointer",
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => alert("Stub: share doc link")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: "transparent",
                      color: t.text,
                      cursor: "pointer",
                    }}
                  >
                    Share
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* ACTIVITY + REPORTS (two-column) */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
            {/* Activity */}
            <section
              style={{
                background: t.card,
                border: `1px solid ${t.border}`,
                borderRadius: 16,
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Recent Activity</h2>
              {ACTIVITY.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: `1px solid ${t.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <div>{a.text}</div>
                  <div style={{ fontSize: 12, color: t.muted }}>{a.when}</div>
                </div>
              ))}
            </section>

            {/* Reports */}
            <section
              style={{
                background: t.card,
                border: `1px solid ${t.border}`,
                borderRadius: 16,
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Reports</h2>
              <div style={{ fontSize: 14, color: t.muted, marginBottom: 12 }}>
                Download snapshots for management reporting.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => alert("Stub: generate employee snapshot")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: "transparent",
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  Employee Snapshot
                </button>
                <button
                  onClick={() => alert("Stub: generate onboarding report")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: "transparent",
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  Onboarding Report
                </button>
              </div>
            </section>
          </div>
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
