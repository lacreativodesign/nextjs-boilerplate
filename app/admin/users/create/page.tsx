"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  INTERNAL_ROLE_OPTIONS,
  USER_DEPARTMENT_VALUES,
  type InternalRole,
  type UserDepartment,
  getDefaultDepartmentForRole,
} from "@/lib/userOptions";
import { toastSuccess } from "@/lib/toast";

type UserStatus = "active" | "disabled";

type Role = InternalRole;
type Department = UserDepartment;

type UserCreatePayload = {
  name: string;
  email: string;
  phone: string;
  cnic: string;
  dob: string | null;
  status: UserStatus;
  role: Role;
  department: Department;
  designation: string;
  joiningDate: string | null;
  salary: number | null;
  monthlyTarget: number | null;
  commission: number | null;
};

type PostWithFallbackResult =
  | { ok: true; json: unknown }
  | { ok: false; error: string };

function toNum(v: string) {
  const n = Number(String(v || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function postWithFallback(urls: string[], body: UserCreatePayload): Promise<PostWithFallbackResult> {
  let lastErr: string | null = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);

      if (res.ok) return { ok: true, json };
      lastErr = json?.error || json?.message || res.statusText || "Request failed";
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : "Network error";
    }
  }

  return { ok: false, error: lastErr || "Failed" };
}

export default function CreateUserPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const muted = "var(--text-muted)";
  const titleCol = "var(--text-primary)";

  const headerStyle: React.CSSProperties = {
    fontSize: 34,
    fontWeight: 900,
    margin: "0 0 8px 0",
    color: titleCol,
  };

  const subStyle: React.CSSProperties = {
    margin: "0 0 18px 0",
    color: muted,
    fontSize: 14,
  };

  // ✅ Key-Accounts master outer shell (shadow included)
  const shellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 18,
    border: "1px solid var(--border-subtle)",
    background: "var(--surface-card)",
    boxShadow: "var(--shadow-md)",
  };

  const roles: Role[] = [...INTERNAL_ROLE_OPTIONS];

  const departments: Department[] = [...USER_DEPARTMENT_VALUES];

  const canSubmit = useMemo(() => {
    if (!fullName.trim()) return false;
    if (!email.trim()) return false;
    return true;
  }, [fullName, email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Please fill required fields (Full Name, Email).");
      return;
    }

    setSaving(true);

    const payload = {
      name: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      cnic: cnic.trim(),
      dob: dob ? new Date(dob).toISOString() : null,
      status,
      role,
      department,
      designation: title.trim(),
      joiningDate: joiningDate ? new Date(joiningDate).toISOString() : null,
      salary: monthlySalaryPkr ? toNum(monthlySalaryPkr) : null,
      monthlyTarget: monthlyTargetUsd ? toNum(monthlyTargetUsd) : null,
      commission: commissionPct ? toNum(commissionPct) : null,
    };

    const result = await postWithFallback(["/api/admin/users/create", "/api/admin/users"], payload);

    setSaving(false);

    if (!result.ok) {
      setError(result.error || "Failed to create user");
      return;
    }

    toastSuccess("Saved successfully.");
    setTimeout(() => router.push("/admin/users"), 800);
  }

  return (
    <div style={{ width: "100%" }}>
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--erp-blue)] hover:underline mb-4 block">
        ← Back to Users
      </Link>
      <h1 style={headerStyle}>Create User</h1>
      <p style={subStyle}>Add a new team member and set role, department, payroll and targets.</p>

      <form onSubmit={onSubmit} style={shellStyle}>
        <div style={{ display: "grid", gap: 12 }}>
          <Section title="Personal Information">
            <div style={grid6} className="grid6">
              <div style={colSpan(2)}>
                <Label text="Full Name" required />
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
              </div>

              <div style={colSpan(2)}>
                <Label text="Email Address" required />
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>

              <div style={colSpan(1)}>
                <Label text="Phone Number" />
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300 0000000" />
              </div>

              <div style={colSpan(1)}>
                <Label text="CNIC Number" />
                <input className="input" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="42101-1234567-1" />
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

          <Section title="Job Details">
            <div style={grid6} className="grid6">
              <div style={colSpan(2)}>
                <Label text="Role" required />
                <select
                  className="input"
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as Role;
                    setRole(nextRole);
                    const nextDepartment = getDefaultDepartmentForRole(nextRole);
                    if (nextDepartment) setDepartment(nextDepartment);
                  }}
                >
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
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Account Manager" />
              </div>

              <div style={colSpan(1)}>
                <Label text="Joining Date" />
                <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="Payroll & Targets">
            <div style={grid6} className="grid6">
              <div style={colSpan(2)}>
                <Label text="Monthly Salary (PKR)" />
                <input className="input" value={monthlySalaryPkr} onChange={(e) => setMonthlySalaryPkr(e.target.value)} placeholder="e.g. 150000" />
              </div>

              <div style={colSpan(2)}>
                <Label text="Monthly Target (USD)" />
                <input className="input" value={monthlyTargetUsd} onChange={(e) => setMonthlyTargetUsd(e.target.value)} placeholder="e.g. 5000" />
              </div>

              <div style={colSpan(2)}>
                <Label text="Commission (%)" />
                <input className="input" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} placeholder="e.g. 5" />
              </div>
            </div>
          </Section>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
            <div style={{ minHeight: 18, fontSize: 13 }}>
              {error ? (
                <span style={{ color: "#EF4444" }}>{error}</span>
              ) : null}
            </div>

            <button className="btn" type="submit" disabled={saving || !canSubmit} style={{ borderRadius: 12 }}>
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </div>
      </form>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{ padding: 14, borderRadius: 16 }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: "0.06em",
        opacity: 0.75,
        marginBottom: 6,
      }}
    >
      <span style={{ textTransform: "uppercase" }}>{text}</span>
      {required ? <span style={{ color: "#EF4444" }}>*</span> : null}
    </div>
  );
}
