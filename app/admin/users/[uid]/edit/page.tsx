"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

const DEPARTMENTS = [
  "sales",
  "am",
  "production",
  "hr",
  "finance",
  "admin",
];

type StatusApi = StatusType | string | undefined;

type UserRecord = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  salary?: number | string;
  monthlyTarget?: number | string;
  commission?: number | string;
  status?: StatusApi;
  cnic?: string;
  dob?: string;
};

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
  const uid = params?.uid as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [role, setRole] = useState("sales");
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

  const resetMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  useEffect(() => {
    if (!uid) {
      setErrorMsg("Invalid user id.");
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadUser() {
      try {
        setLoading(true);

        const res = await fetch("/api/admin/users/get", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uid }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load user details");
        }

        const data: UserRecord = await res.json();
        if (!isMounted) return;

        setName(data.name || "");
        setEmail(data.email || "");

        setRole(data.role ? String(data.role).toLowerCase() : "sales");
        setPhone(data.phone || "");
        setDepartment(
          data.department ? String(data.department).toLowerCase() : "sales"
        );
        setDesignation(data.designation || "");
        setJoiningDate(data.joiningDate || "");
        setCnic(data.cnic || "");
        setDob(data.dob || "");

        setSalary(
          typeof data.salary === "number"
            ? String(data.salary)
            : data.salary
            ? String(data.salary)
            : ""
        );
        setMonthlyTarget(
          typeof data.monthlyTarget === "number"
            ? String(data.monthlyTarget)
            : data.monthlyTarget
            ? String(data.monthlyTarget)
            : ""
        );
        setCommission(
          typeof data.commission === "number"
            ? String(data.commission)
            : data.commission
            ? String(data.commission)
            : ""
        );
        setStatus(
          data.status && String(data.status).toLowerCase() === "disabled"
            ? "disabled"
            : "active"
        );

        setInitialLoaded(true);
      } catch (err: any) {
        if (isMounted) {
          console.error("Error loading user:", err);
          setErrorMsg(err?.message || "Failed to load user.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!uid) {
      setErrorMsg("Missing user id.");
      return;
    }

    if (!name.trim()) {
      setErrorMsg("Name is required.");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid,
          name: name.trim(),
          // email NOT editable
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
        const msg = data?.error || "Failed to update user.";
        throw new Error(msg);
      }

      setSuccessMsg("User updated successfully.");
    } catch (err: any) {
      console.error("Error updating user:", err);
      setErrorMsg(err?.message || "Failed to update user.");
    } finally {
      setSaving(false);
    }
  };

  if (!uid) {
    return (
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
          Edit User
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--danger)",
          }}
        >
          Invalid user id.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        Edit User
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 16,
        }}
      >
        Update user details, role, department and payroll information.
      </p>

      {loading && !initialLoaded ? (
        <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
          Loading user details...
        </p>
      ) : errorMsg ? (
        <p
          style={{
            fontSize: 14,
            color: "var(--danger)",
          }}
        >
          {errorMsg}
        </p>
      ) : (
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
              {/* Name */}
              <FieldWrapper label="Full Name" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  style={inputStyle}
                />
              </FieldWrapper>

              {/* Email (read-only) */}
              <FieldWrapper label="Email Address">
                <input
                  type="email"
                  value={email}
                  readOnly
                  style={{
                    ...inputStyle,
                    background: "var(--input-bg-disabled)",
                    cursor: "not-allowed",
                    opacity: 0.9,
                  }}
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
                  onChange={(e) =>
                    setStatus(e.target.value as StatusType)
                  }
                  style={selectStyle}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
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
              <FieldWrapper label="Role">
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
                  placeholder="e.g. 5"
                  style={inputStyle}
                />
              </FieldWrapper>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              alignSelf: "flex-start",
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: saving ? "var(--border)" : "var(--primary)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {successMsg && (
            <p
              style={{
                fontSize: 14,
                color: "var(--success)",
                marginTop: 8,
              }}
            >
              {successMsg}
            </p>
          )}
        </form>
      )}
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
          color: "var(--sidebar-text)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
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
