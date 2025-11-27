"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { useRouter } from "next/navigation";

export default function CreateUserPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    salary: "",
    monthlyTarget: "",
    commission: "",
    joiningDate: "",
    role: "",
    password: "",
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
        setMsg(data.error || "Missing fields");
      } else {
        setMsg("User created successfully.");
        setTimeout(() => router.push("/admin/users"), 800);
      }
    } catch (err: any) {
      setMsg("Unexpected error: " + err.message);
    }

    setLoading(false);
  };

  return (
    <RequireAuth allowed={["super_admin", "admin"]}>
      <div className="p-6 w-full">
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
          className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {/* LEFT SIDE */}
          <div className="flex flex-col gap-4">
            <Field
              label="Full Name"
              required
              value={form.name}
              onChange={(v) => handleChange("name", v)}
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(v) => handleChange("phone", v)}
            />
            <Field
              label="Designation"
              value={form.designation}
              onChange={(v) => handleChange("designation", v)}
            />
            <Field
              label="Monthly Target"
              value={form.monthlyTarget}
              onChange={(v) => handleChange("monthlyTarget", v)}
            />
            <Field
              label="Joining Date"
              type="date"
              value={form.joiningDate}
              onChange={(v) => handleChange("joiningDate", v)}
            />
          </div>

          {/* RIGHT SIDE */}
          <div className="flex flex-col gap-4">
            <Field
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(v) => handleChange("email", v)}
            />
            <Select
              label="Department"
              required
              value={form.department}
              onChange={(v) => handleChange("department", v)}
              options={[
                "Admin",
                "Sales",
                "Sales Manager",
                "Account Manager",
                "Finance",
                "HR",
                "Production",
                "Client",
              ]}
            />
            <Field
              label="Salary"
              value={form.salary}
              onChange={(v) => handleChange("salary", v)}
            />
            <Field
              label="Commission %"
              value={form.commission}
              onChange={(v) => handleChange("commission", v)}
            />

            {/* Password with eye toggle */}
            <div className="flex flex-col">
              <label className="mb-1 font-medium">Password</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  className="w-full p-2 pr-10 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* ROLE + STATUS SPAN TWO COLUMNS */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Select
              label="Role"
              required
              value={form.role}
              onChange={(v) => handleChange("role", v)}
              options={[
                "admin",
                "sales_manager",
                "sales",
                "am",
                "production",
                "hr",
                "finance",
                "client",
              ]}
            />

            <Select
              label="Status"
              value={form.status}
              onChange={(v) => handleChange("status", v)}
              options={["active", "disabled"]}
            />
          </div>

          {/* BUTTON */}
          <div className="md:col-span-2">
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

/* -------------------- REUSABLE COMPONENTS -------------------- */

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: any) {
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

function Select({ label, value, onChange, options, required = false }: any) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 font-medium">{label}</label>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="p-2 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
      >
        <option value="">Select {label}</option>
        {options.map((o: string) => (
          <option key={o} value={o.toLowerCase().replace(/ /g, "_")}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
