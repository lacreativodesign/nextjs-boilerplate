"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type UserStatus = "active" | "disabled";

type Role =
  | "super_admin"
  | "admin"
  | "sales_manager"
  | "sales"
  | "account_manager"
  | "production"
  | "hr"
  | "finance"
  | "client";

type Department =
  | "admin"
  | "sales"
  | "account_manager"
  | "production"
  | "hr"
  | "finance"
  | "client";

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const read = () => {
      const byClass = root.classList.contains("dark");
      const bySystem = !!mql.matches;
      setIsDark(byClass || bySystem);
    };

    read();

    const obs = new MutationObserver(() => read());
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });

    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);

    return () => {
      obs.disconnect();
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}

function isoToDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toNum(v: string) {
  const n = Number(String(v || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function tryRequests(tries: Array<{ url: string; method: string; body?: any }>) {
  let lastErr: any = null;

  for (const t of tries) {
    try {
      const res = await fetch(t.url, {
        method: t.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: t.body ? JSON.stringify(t.body) : undefined,
      });

      const json = await res.json().catch(() => null);

      if (res.ok) return { ok: true, json };
      lastErr = json?.error || json?.message || res.statusText || "Request failed";
    } catch (e: any) {
      lastErr = e?.message || "Network error";
    }
  }

  return { ok: false, error: lastErr || "Failed" };
}

export default function EditUserPage() {
  const isDark = useIsDarkMode();
  const router = useRouter();
  const params = useParams();
  const uid = String((params as any)?.uid || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [dob, setDob] = useState("");
  const [status, setStatus] = useState<UserStatus>("active");

  const [role, setRole] = useState<Role>("sales");
  const [department, setDepartment] = useState<Department>("sales");
  const [title, setTitle] = useState("");
  const [joiningDate, setJoiningDate] = useState("");

  const [monthlySalaryPkr, setMonthlySalaryPkr] = useState("");
  const [monthlyTargetUsd, setMonthlyTargetUsd] = useState("");
  const [commissionPct, setCommissionPct] = useState("");

  const muted = isDark ? "rgba(255,255,255,0.70)" : "rgba(15,23,42,0.65)";
  const titleCol = isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)";

  // ✅ Key-Accounts master outer shell (shadow included)
  const shellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 18,
    border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const roles: Role[] = [
    "super_admin",
    "admin",
    "sales_manager",
    "sales",
    "account_manager",
    "production",
    "hr",
    "finance",
    "client",
  ];

  const departments: Department[] = ["admin", "sales", "account_manager", "production", "hr", "finance", "client"];

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!uid) return;

      setLoading(true);
      setError(null);

      const res = await tryRequests([{ url: `/api/admin/users/${uid}`, method: "GET" }]);

      if (!alive) return;

      if (!res.ok) {
        setError(String((res as any).error || "Failed to fetch user details."));
        setLoading(false);
        return;
      }

      const data = (res as any).json || {};

      setFullName(String(data.fullName ?? data.name ?? data.displayName ?? ""));
      setEmail(String(data.email ?? ""));
      setPhone(String(data.phone ?? ""));
      setCnic(String(data.cnic ?? ""));
      setDob(isoToDateInput(data.dob ?? data.dateOfBirth ?? null));
      setStatus((String(data.status ?? "active").toLowerCase() as UserStatus) || "active");

      setRole((String(data.role ?? "sales").toLowerCase() as Role) || "sales");
      setDepartment((String(data.department ?? "sales").toLowerCase() as Department) || "sales");
      setTitle(String(data.title ?? data.designation ?? ""));
      setJoiningDate(isoToDateInput(data.joiningDate ?? data.joinDate ?? null));

      setMonthlySalaryPkr(String(data.monthlySalaryPkr ?? data.salaryPkr ?? ""));
      setMonthlyTargetUsd(String(data.monthlyTargetUsd ?? data.targetUsd ?? ""));
      setCommissionPct(String(data.commissionPct ?? data.commission ?? ""));

      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [uid]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    if (!uid || !fullName.trim()) {
      setError("Please fill required fields.");
      return;
    }

    setSaving(true);

    const payload = {
      uid,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      cnic: cnic.trim(),
      dob: dob ? new Date(dob).toISOString() : null,
      status,
      role,
      department,
      title: title.trim(),
      joiningDate: joiningDate ? new Date(joiningDate).toISOString() : null,
      monthlySalaryPkr: toNum(monthlySalaryPkr),
      monthlyTargetUsd: toNum(monthlyTargetUsd),
      commissionPct: toNum(commissionPct),
    };

    const res = await tryRequests([
      { url: `/api/admin/users/update`, method: "POST", body: payload },
      { url: `/api/admin/users/${uid}`, method: "PATCH", body: payload },
      { url: `/api/admin/users/${uid}/update`, method: "POST", body: payload },
    ]);

    setSaving(false);

    if (!res.ok) {
      setError(String((res as any).error || "Failed to save user."));
      return;
    }

    setOkMsg("Saved.");
    setTimeout(() => router.push("/admin/users"), 450);
  }

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: "0 0 8px 0", color: titleCol }}>Edit User</h1>
      <p style={{ margin: "0 0 18px 0", color: muted, fontSize: 14 }}>Update team member profile, role, department, payroll and targets.</p>

      <div style={shellStyle}>
        {loading ? (
          <div style={{ fontSize: 14, color: muted }}>Loading user...</div>
        ) : (
          <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
            <Section title="Personal Information" isDark={isDark}>
              <div style={grid6}>
                <div style={colSpan(2)}>
                  <Label text="Full Name" required />
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>

                <div style={colSpan(2)}>
                  <Label text="Email Address" />
                  <input className="input" value={email} readOnly style={{ opacity: 0.9, cursor: "not-allowed" }} />
                </div>

                <div style={colSpan(1)}>
                  <Label text="Phone Number" />
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>

                <div style={colSpan(1)}>
                  <Label text="CNIC Number" />
                  <input className="input" value={cnic} onChange={(e) => setCnic(e.target.value)} />
                </div>

                <div style={colSpan(2)}>
                  <Label text="Date of Birth (D.O.B.)" />
                  <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>

                <div style={colSpan(2)}>
                  <Label text="Status" />
                  <select className="input" value={status} onChange={(e) => setStatus(e.target.value as UserStatus)}>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
            </Section>

            <Section title="Job Details" isDark={isDark}>
              <div style={grid6}>
                <div style={colSpan(2)}>
                  <Label text="Role" />
                  <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={colSpan(2)}>
                  <Label text="Department" />
                  <select className="input" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={colSpan(1)}>
                  <Label text="Designation / Title" />
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div style={colSpan(1)}>
                  <Label text="Joining Date" />
                  <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title="Payroll & Targets" isDark={isDark}>
              <div style={grid6}>
                <div style={colSpan(2)}>
                  <Label text="Monthly Salary (PKR)" />
                  <input className="input" value={monthlySalaryPkr} onChange={(e) => setMonthlySalaryPkr(e.target.value)} />
                </div>

                <div style={colSpan(2)}>
                  <Label text="Monthly Target (USD)" />
                  <input className="input" value={monthlyTargetUsd} onChange={(e) => setMonthlyTargetUsd(e.target.value)} />
                </div>

                <div style={colSpan(2)}>
                  <Label text="Commission (%)" />
                  <input className="input" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
                </div>
              </div>
            </Section>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 4 }}>
              <div style={{ minHeight: 18, fontSize: 13 }}>
                {error ? <span style={{ color: "#EF4444" }}>{error}</span> : okMsg ? <span style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.75)" }}>{okMsg}</span> : null}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="btn ghost" onClick={() => router.push("/admin/users")} style={{ borderRadius: 12 }}>
                  Cancel
                </button>
                <button className="btn" type="submit" disabled={saving || !uid || !fullName.trim()} style={{ borderRadius: 12 }}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 1100px) {
          .grid6 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .grid6 > div {
            grid-column: span 2 / span 2 !important;
          }
        }
      `}</style>
    </div>
  );
}

const grid6: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
};

const colSpan = (n: number): React.CSSProperties => ({ gridColumn: `span ${n} / span ${n}` });

function Section({ title, isDark, children }: { title: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 16,
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75, marginBottom: 6 }}>
      <span style={{ textTransform: "uppercase" }}>{text}</span>
      {required ? <span style={{ color: "#EF4444" }}>*</span> : null}
    </div>
  );
}
