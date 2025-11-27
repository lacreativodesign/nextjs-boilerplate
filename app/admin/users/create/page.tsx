"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";

export default function CreateUserPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    password: "",
    department: "",
    designation: "",
    phone: "",
    salary: "",
    monthlyTarget: "",
    commission: "",
    joiningDate: "",
    status: "active",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data.error || "Failed to create user");
      } else {
        setMsg("User created successfully.");
        setTimeout(() => {
          router.push("/admin/users");
        }, 800);
      }
    } catch (err: any) {
      console.error(err);
      setMsg("Unexpected error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth allowed={["super_admin", "admin"]}>
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-6">Create User</h1>

        {msg && (
          <div
            className={`mb-4 p-3 rounded ${
              msg.toLowerCase().includes("success")
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {msg}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* Personal / basic */}
          <Field
            label="Full Name"
            required
            value={form.name}
            onChange={(v) => handleChange("name", v)}
          />
          <Field
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={(v) => handleChange("email", v)}
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(v) => handleChange("phone", v)}
          />
          <Field
            label="Department"
            value={form.department}
            onChange={(v) => handleChange("department", v)}
          />
          <Field
            label="Designation"
            value={form.designation}
            onChange={(v) => handleChange("designation", v)}
          />

          {/* Job / payroll */}
          <Field
            label="Salary"
            value={form.salary}
            onChange={(v) => handleChange("salary", v)}
          />
          <Field
            label="Monthly Target"
            value={form.monthlyTarget}
            onChange={(v) => handleChange("monthlyTarget", v)}
          />
          <Field
            label="Commission %"
            value={form.commission}
            onChange={(v) => handleChange("commission", v)}
          />
          <Field
            label="Joining Date"
            type="date"
            value={form.joiningDate}
            onChange={(v) => handleChange("joiningDate", v)}
          />

          {/* System access */}
          <div className="flex flex-col">
            <label className="mb-1 font-medium">Role</label>
            <select
              required
              className="p-2 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
              value={form.role}
              onChange={(e) => handleChange("role", e.target.value)}
            >
              <option value="">Select role</option>
              <option value="admin">Admin</option>
              <option value="sales_manager">Sales Manager</option>
              <option value="sales">Sales</option>
              <option value="am">Account Manager</option>
              <option value="production">Production</option>
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
              <option value="client">Client</option>
            </select>
          </div>

          <Field
            label="Password"
            type="password"
            required
            value={form.password}
            onChange={(v) => handleChange("password", v)}
          />

          <div className="flex flex-col">
            <label className="mb-1 font-medium">Status</label>
            <select
              className="p-2 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
              value={form.status}
              onChange={(e) => handleChange("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          <div className="md:col-span-2 mt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </RequireAuth>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
};

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: FieldProps) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 font-medium">{label}</label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="p-2 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
      />
    </div>
  );
}
