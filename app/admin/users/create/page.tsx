"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type React from "react";

type StatusType = "active" | "disabled";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "sales", label: "Sales" },
  { value: "am", label: "Account Manager" },
  { value: "hr", label: "HR" },
  { value: "finance", label: "Finance" },
];

const DEPARTMENTS = ["sales", "am", "production", "hr", "finance", "admin"];

export default function CreateUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("sales");
  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");

  const [cnic, setCnic] = useState("");
  const [dob, setDob] = useState("");

  const [salary, setSalary] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [commission, setCommission] = useState("");
  const [status, setStatus] = useState<StatusType>("active");

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const resetMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!name.trim() || !email.trim() || !password.trim() || !role) {
      setErrorMsg("Please fill in name, email, role and password.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role,

          phone: phone.trim(),
          department,
          designation: designation.trim(),
          joiningDate: joiningDate || "",
          cnic: cnic.trim(),
          dob: dob || "",

          salary: salary.trim(),
          monthlyTarget: monthlyTarget.trim(),
          commission: commission.trim(),

          status,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || "Failed to create user.";
        throw new Error(msg);
      }

      setSuccessMsg("User created successfully.");

      // Reset but keep defaults
      setName("");
      setEmail("");
      setPassword("");
      setShowPassword(false);

      setPhone("");
      setDepartment("sales");
      setDesignation("");
      setJoiningDate("");
      setCnic("");
      setDob("");

      setSalary("");
      setMonthlyTarget("");
      setCommission("");
      setStatus("active");
    } catch (err: any) {
      console.error("Error creating user:", err);
      setErrorMsg(err?.message || "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  const shell: React.CSSProperties = {
    borderRadius: 20,
    padding: 18,
    border: "1px solid var(--shell-border)",
    background: "var(--shell-bg)",
    boxShadow: "var(--shell-shadow)",
  };

  const sectionCard: React.CSSProperties = {
    borderRadius: 14,
    padding: 14,
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 12,
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 14,
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "inherit",
    fontSize: 14,
  };

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: "var(--ink)",
        }}
      >
        Create User
      </h1>

      <div style={{ marginBottom: 18, color: "var(--muted)" }}>
        Add a new team member and set role, department, payroll and targets.
      </div>

      {successMsg ? (
        <div style={{ marginBottom: 12, fontSize: 14, color: "#22C55E", fontWeight: 700 }}>{successMsg}</div>
      ) : null}

      {errorMsg ? (
        <div style={{ marginBottom: 12, fontSize: 14, color: "#EF4444", fontWeight: 700 }}>{errorMsg}</div>
      ) : null}

      <div style={shell}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* PERSONAL */}
          <div style={sectionCard}>
            <div style={sectionTitle}>Personal Information</div>
            <div style={grid}>
              <Field label="Full Name" required>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
              </Field>

              <Field label="Email Address" required>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                />
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
                <select value={status} onChange={(e) => setStatus(e.target.value as StatusType)} style={selectStyle}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>

              <Field label="Password" required>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    className="input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Assign a secure password"
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="btn ghost"
                    style={{
                      position: "absolute",
                      right: 8,
                      height: 34,
                      width: 38,
                      padding: 0,
                      borderRadius: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            </div>
          </div>

          {/* JOB */}
          <div style={sectionCard}>
            <div style={sectionTitle}>Job Details</div>
            <div style={grid}>
              <Field label="Role" required>
                <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Department">
                <select value={department} onChange={(e) => setDepartment(e.target.value)} style={selectStyle}>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Designation / Title">
                <input
                  className="input"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Senior Account Manager"
                />
              </Field>

              <Field label="Joining Date">
                <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
              </Field>
            </div>
          </div>

          {/* PAYROLL */}
          <div style={sectionCard}>
            <div style={sectionTitle}>Payroll & Targets</div>
            <div style={grid}>
              <Field label="Monthly Salary (PKR)">
                <input className="input" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 150000" />
              </Field>

              <Field label="Monthly Target (Amount)">
                <input
                  className="input"
                  value={monthlyTarget}
                  onChange={(e) => setMonthlyTarget(e.target.value)}
                  placeholder="e.g. 500000"
                />
              </Field>

              <Field label="Commission (%)">
                <input className="input" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="e.g. 5" />
              </Field>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 6 }}>
            <button type="submit" disabled={loading} className="btn" style={{ opacity: loading ? 0.7 : 1 }}>
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--muted)",
        }}
      >
        {label}
        {required ? <span style={{ color: "#EF4444", marginLeft: 6 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}
