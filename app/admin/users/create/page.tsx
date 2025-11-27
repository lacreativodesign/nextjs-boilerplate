"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
  { value: "client", label: "Client" },
];

const DEPARTMENTS = [
  "management",
  "sales",
  "marketing",
  "am",
  "hr",
  "finance",
  "production",
  "support",
];

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

  const [salary, setSalary] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [commission, setCommission] = useState("");
  const [status, setStatus] = useState<StatusType>("active");

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const resetMessages = () => {
    setSuccessMsg("");
    setErrorMsg("");
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
      // Clear fields but keep sensible defaults
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setDepartment("sales");
      setDesignation("");
      setJoiningDate("");
      setSalary("");
      setMonthlyTarget("");
      setCommission("");
      setRole("sales");
      setStatus("active");
    } catch (err: any) {
      setErrorMsg(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        Create User
      </h2>

      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 20,
        }}
      >
        Add a new team member to the LA CREATIVO ERP and assign role, department and
        payroll settings.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* PERSONAL INFO CARD */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
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
                    color: "var(--sidebar-text)",
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
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
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
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
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
                placeholder="e.g. 10"
                style={inputStyle}
              />
            </FieldWrapper>
          </div>
        </div>

        {/* ACTIONS + MESSAGES */}
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              alignSelf: "flex-start",
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: loading ? "var(--border)" : "var(--primary)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Creating user..." : "Create User"}
          </button>

          {successMsg && (
            <p
              style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--success)",
              }}
            >
              {successMsg}
            </p>
          )}

          {errorMsg && (
            <p
              style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--danger)",
              }}
            >
              {errorMsg}
            </p>
          )}
        </div>
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
          fontSize: 13,
          fontWeight: 500,
          color: "var(--sidebar-text)",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  color: "var(--text)",
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  color: "var(--text)",
  fontSize: 14,
};
