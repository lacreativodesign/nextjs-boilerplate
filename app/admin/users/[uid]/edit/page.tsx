"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchUserRole, getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import type { Unsubscribe } from "firebase/auth";

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

type UserDoc = {
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  cnic?: string;
  dob?: string | null;

  status?: UserStatus | string;
  role?: Role | string;
  department?: Department | string;

  designation?: string;
  joiningDate?: string | null;

  salary?: number | null;
  monthlyTarget?: number | null;
  commission?: number | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};

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

function toNum(v: string) {
  if (v === "") return null;
  const n = Number(String(v || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ uid: string }>();
  const uid = params?.uid;
  const isDark = useIsDarkMode();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentRole, setCurrentRole] = useState<string | null>(null);

  // form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [dob, setDob] = useState("");

  const [status, setStatus] = useState<UserStatus>("active");
  const [role, setRole] = useState<Role>("sales");
  const [department, setDepartment] = useState<Department>("sales");

  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");

  const [monthlySalaryPkr, setMonthlySalaryPkr] = useState("");
  const [monthlyTargetUsd, setMonthlyTargetUsd] = useState("");
  const [commissionPct, setCommissionPct] = useState("");

  const muted = isDark ? "rgba(255,255,255,0.70)" : "rgba(15,23,42,0.65)";
  const titleCol = isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)";

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
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    getFirebaseAuth()
      .then((auth) => {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, async (user) => {
          if (!user) {
            setCurrentRole(null);
            return;
          }
          const roleValue = await fetchUserRole(user.uid);
          setCurrentRole(roleValue);
        });
      })
      .catch((err) => {
        console.error("Failed to load Firebase auth", err);
        setCurrentRole(null);
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
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

        setFullName(String(data?.name || ""));
        const loadedEmail = String(data?.email || "");
        setEmail(loadedEmail);
        setInitialEmail(loadedEmail);
        setPhone(String(data?.phone || ""));
        setCnic(String(data?.cnic || ""));

        setDob(toInputDate(data?.dob || null));

        setStatus((String(data?.status || "active").toLowerCase() as UserStatus) || "active");
        setRole((String(data?.role || "sales").toLowerCase() as Role) || "sales");
        setDepartment((String(data?.department || "sales").toLowerCase() as Department) || "sales");

        setDesignation(String(data?.designation || ""));
        setJoiningDate(toInputDate(data?.joiningDate || null));

        setMonthlySalaryPkr(data?.salary == null ? "" : String(Number(data.salary)));
        setMonthlyTargetUsd(data?.monthlyTarget == null ? "" : String(Number(data.monthlyTarget)));
        setCommissionPct(data?.commission == null ? "" : String(Number(data.commission)));
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

  const isEmailLocked = currentRole === "hr";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!uid) return setError("Missing user id.");
    if (!fullName.trim()) return setError("Missing required fields: name");

    const emailToSend = (isEmailLocked ? initialEmail : email).trim() || initialEmail.trim();
    if (!emailToSend) return setError("Missing required fields: email");
    if (!role.trim()) return setError("Missing required fields: role");
    if (!department.trim()) return setError("Missing required fields: department");

    setSaving(true);

    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          uid,
          name: fullName.trim(),
          email: emailToSend,
          phone: phone.trim(),
          cnic: cnic.trim(),
          dob: fromInputDate(dob),

          status,
          role,
          department,

          designation: designation.trim(),
          joiningDate: fromInputDate(joiningDate),

          salary: toNum(monthlySalaryPkr),
          monthlyTarget: toNum(monthlyTargetUsd),
          commission: toNum(commissionPct),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Update failed.");
      }

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
      <h1 style={headerStyle}>Edit User</h1>
      <p style={subStyle}>Update profile, work details, and targets.</p>

      <form onSubmit={onSubmit} style={shellStyle}>
        <div style={{ display: "grid", gap: 12 }}>
          <Section title="Personal Information" isDark={isDark}>
            <div style={grid6} className="grid6">
              <div style={colSpan(2)}>
                <Label text="Full Name" required />
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
              </div>

              <div style={colSpan(2)}>
                <Label text="Email Address" required />
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={isEmailLocked}
                />
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

          <Section title="Job Details" isDark={isDark}>
            <div style={grid6} className="grid6">
              <div style={colSpan(2)}>
                <Label text="Role" required />
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
                <input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Account Manager" />
              </div>

              <div style={colSpan(1)}>
                <Label text="Joining Date" />
                <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="Payroll & Targets" isDark={isDark}>
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
              {error ? <span style={{ color: "#EF4444" }}>{error}</span> : null}
            </div>

            <button className="btn" type="submit" disabled={saving} style={{ borderRadius: 12 }}>
              {saving ? "Saving..." : "Save Changes"}
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
