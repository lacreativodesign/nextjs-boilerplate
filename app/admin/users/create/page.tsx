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
  { value: "production", label: "Production" },
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
        headers: {
          "Content-Type": "application/json",
        },
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

      // Reset but keep sensible defaults
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

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        Create New User
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--mut, #94A3B8)",
          marginBottom: 16,
        }}
      >
        Add a new team member to the LA CREATIVO ERP and assign role,
        department and payroll settings.
      </p>

      {successMsg && (
        <p
          style={{
            fontSize: 14,
            color: "var(--success, #22C55E)",
            marginBottom: 10,
          }}
        >
          {successMsg}
        </p>
      )}

      {errorMsg && (
        <p
          style={{
            fontSize: 14,
            color: "var(--danger, #EF4444)",
            marginBottom: 10,
          }}
        >
          {errorMsg}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* PERSONAL INFORMATION CARD */}
        <div
          style={{
            background: "var(--card, #0D1A33)",
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,.35)",
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Personal Information
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16,
            }}
          >
            {/* Full Name */}
            <FieldWrapper label="Full Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Email */}
            <FieldWrapper label="Email Address" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Phone */}
            <FieldWrapper label="Phone Number">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 300 0000000"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* CNIC */}
            <FieldWrapper label="CNIC Number">
              <input
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
                placeholder="42101-1234567-1"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Date of Birth */}
            <FieldWrapper label="Date of Birth (D.O.B.)">
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Status */}
            <FieldWrapper label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusType)}
                style={selectStyle}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </FieldWrapper>

            {/* Password */}
            <FieldWrapper label="Password" required>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Assign a secure password"
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    position: "absolute",
                    right: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "var(--mut, #94A3B8)",
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FieldWrapper>
          </div>
        </div>

        {/* JOB DETAILS CARD */}
        <div
          style={{
            background: "var(--card, #0D1A33)",
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,.35)",
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Job Details
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16,
            }}
          >
            {/* Role */}
            <FieldWrapper label="Role" required>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={selectStyle}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </FieldWrapper>

            {/* Department */}
            <FieldWrapper label="Department">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={selectStyle}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </FieldWrapper>

            {/* Designation */}
            <FieldWrapper label="Designation / Title">
              <input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Senior Account Manager"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Joining Date */}
            <FieldWrapper label="Joining Date">
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                style={inputStyle}
              />
            </FieldWrapper>
          </div>
        </div>

        {/* PAYROLL CARD */}
        <div
          style={{
            background: "var(--card, #0D1A33)",
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,.35)",
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Payroll & Targets
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16,
            }}
          >
            {/* Salary */}
            <FieldWrapper label="Monthly Salary (PKR)">
              <input
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 150000"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Monthly Target */}
            <FieldWrapper label="Monthly Target (Amount)">
              <input
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(e.target.value)}
                placeholder="e.g. 500000"
                style={inputStyle}
              />
            </FieldWrapper>

            {/* Commission */}
            <FieldWrapper label="Commission (%)">
              <input
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="e.g. 5"
                style={inputStyle}
              />
            </FieldWrapper>
          </div>
        </div>

        <button
  type="submit"
  disabled={loading}
  style={{
    marginTop: 4,
    background: loading
      ? "rgba(148,163,184,.5)"
      : "var(--accent, #6366F1)",
    padding: "10px 18px",
    color: "white",
    borderRadius: 8,
    border: "none",
    cursor: loading ? "default" : "pointer",
    fontWeight: 600,
    opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Creating..." : "Create User"}
        </button>
      </form>
    </div>
  );
}

function FieldWrapper({
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
          fontSize: 12,
          fontWeight: 500,
          color: "var(--mut, #94A3B8)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--danger, #EF4444)", marginLeft: 4 }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,.35)",
  background: "transparent",
  color: "inherit",
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,.35)",
  background: "transparent",
  color: "inherit",
  fontSize: 14,
};
