"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Role = "super_admin" | "admin" | "sales_manager" | "sales" | "account_manager" | "production" | "hr" | "finance" | "client";
type Status = "active" | "disabled";

type UserDoc = {
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  cnic?: string;
  dob?: string | null;

  status?: Status | string;
  role?: Role | string;
  department?: string;

  designation?: string; // ✅ correct key
  joiningDate?: string | null;

  salary?: number | null;
  monthlyTarget?: number | null;
  commission?: number | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};

function toInputDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromInputDate(v: string) {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ uid: string }>();
  const uid = params?.uid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState(""); // shown but should be disabled in UI
  const [initialEmail, setInitialEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [dob, setDob] = useState(""); // yyyy-mm-dd

  const [status, setStatus] = useState<Status>("active");
  const [role, setRole] = useState<Role>("sales");
  const [department, setDepartment] = useState("");

  const [designation, setDesignation] = useState(""); // ✅ fixed
  const [joiningDate, setJoiningDate] = useState("");

  const [salary, setSalary] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [commission, setCommission] = useState("");

  // UI styles (Key-Accounts Master look)
  const shellStyle: React.CSSProperties = {
    borderRadius: 22,
    padding: 16,
    border: "1px solid rgba(148,163,184,0.28)",
    background: "rgba(38,38,38,0.55)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
  };

  const lightShellStyle: React.CSSProperties = {
    borderRadius: 22,
    padding: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.85)",
    boxShadow: "0 18px 55px rgba(15,23,42,0.10)",
  };

  // detect dark (matches your system + manual)
  const isDark = useMemo(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!uid) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/admin/users/${uid}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Failed to fetch user details.");
        }

        const data: UserDoc = await res.json();

        if (!alive) return;

        setName(String(data?.name || ""));
        const loadedEmail = String(data?.email || "");
        setEmail(loadedEmail);
        setInitialEmail(loadedEmail);
        setPhone(String(data?.phone || ""));
        setCnic(String(data?.cnic || ""));

        setDob(toInputDate(data?.dob || null));

        setStatus((String(data?.status || "active").toLowerCase() as Status) || "active");
        setRole((String(data?.role || "sales").toLowerCase() as Role) || "sales");
        setDepartment(String(data?.department || ""));

        // ✅ correct field mapping
        setDesignation(String(data?.designation || ""));
        setJoiningDate(toInputDate(data?.joiningDate || null));

        setSalary(data?.salary == null ? "" : String(Number(data.salary)));
        setMonthlyTarget(data?.monthlyTarget == null ? "" : String(Number(data.monthlyTarget)));
        setCommission(data?.commission == null ? "" : String(Number(data.commission)));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to fetch user details.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [uid]);

  async function onSave() {
    setError(null);

    // required fields (match your API expectations)
    if (!uid) return setError("Missing user id.");
    if (!name.trim()) return setError("Missing required fields: name");

    const finalEmail = email.trim() || initialEmail.trim();
    if (!finalEmail) return setError("Missing required fields: email");
    if (!role.trim()) return setError("Missing required fields: role");
    if (!department.trim()) return setError("Missing required fields: department");

    setSaving(true);

    try {
      // ✅ IMPORTANT: post to the real route you have: /api/admin/users/update
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          uid,
          name: name.trim(),
          email: finalEmail, // email stays same for HR; server will block changes for non-admin anyway
          phone: phone.trim(),
          cnic: cnic.trim(),
          dob: fromInputDate(dob),

          status,
          role,
          department: department.trim(),

          // ✅ correct key
          designation: designation.trim(),
          joiningDate: fromInputDate(joiningDate),

          salary: salary === "" ? null : Number(salary),
          monthlyTarget: monthlyTarget === "" ? null : Number(monthlyTarget),
          commission: commission === "" ? null : Number(commission),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Update failed.");
      }

      // back to users list
      router.push("/admin/users");
    } catch (e: any) {
      setError(e?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>Loading...</div>;
  }

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
        }}
      >
        Edit User
      </h1>

      <div style={{ marginBottom: 18, color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)" }}>
        Update profile, work details, and targets. Email is locked for non-admin roles.
      </div>

      <div style={isDark ? shellStyle : lightShellStyle}>
        {error && (
          <div style={{ marginBottom: 12, color: "#FCA5A5", fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 14 }}>
          {/* PERSONAL */}
          <Section title="Personal Information" isDark={isDark}>
            <Field label="Full Name *">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Doe" />
            </Field>

            <Field label="Email Address *">
              <input className="input" value={email} disabled placeholder="Email cannot be changed" />
            </Field>

            <Field label="Phone Number">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300 0000000" />
            </Field>

            <Field label="CNIC Number">
              <input className="input" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="42101-1234567-1" />
            </Field>

            <Field label="Date of Birth (D.O.B.)">
              <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>

            <Field label="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </Field>
          </Section>

          {/* JOB */}
          <Section title="Job Details" isDark={isDark}>
            <Field label="Role *">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="sales_manager">Sales Manager</option>
                <option value="sales">Sales</option>
                <option value="account_manager">Account Manager</option>
                <option value="production">Production</option>
                <option value="hr">HR</option>
                <option value="finance">Finance</option>
                <option value="client">Client</option>
              </select>
            </Field>

            <Field label="Department *">
              <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" />
            </Field>

            <Field label="Designation / Title">
              <input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. HR Manager" />
            </Field>

            <Field label="Joining Date">
              <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </Field>
          </Section>

          {/* PAY */}
          <Section title="Payroll & Targets" isDark={isDark}>
            <Field label="Monthly Salary (PKR)">
              <input className="input" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 150000" />
            </Field>

            <Field label="Monthly Target (Amount)">
              <input className="input" value={monthlyTarget} onChange={(e) => setMonthlyTarget(e.target.value)} placeholder="e.g. 500000" />
            </Field>

            <Field label="Commission (%)">
              <input className="input" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="e.g. 5" />
            </Field>
          </Section>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn ghost" onClick={() => router.back()} disabled={saving}>
              Cancel
            </button>
            <button className="btn" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, isDark, children }: { title: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>
        {title}
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      {children}
    </div>
  );
}
