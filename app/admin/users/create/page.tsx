"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useRouter } from "next/navigation";

export default function CreateUserPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    cnic: "",
    emergencyName: "",
    emergencyPhone: "",
    department: "",
    designation: "",
    joiningDate: "",
    contractType: "",
    shiftTimings: "",
    salary: "",
    incentives: "",
    commission: "",
    monthlyTarget: "",
    leaveEntitlement: "",
    role: "",
    password: "",
    status: "active",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data.error || "Failed to create user");
      } else {
        setMsg("User created successfully!");
        setTimeout(() => router.push("/admin/users"), 800);
      }
    } catch (err: any) {
      setMsg("Unexpected error: " + err.message);
    }

    setLoading(false);
  };

  return (
    <RequireAuth allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-6">Create User</h1>

        {msg && (
          <div
            className={`mb-4 p-3 rounded ${
              msg.includes("success")
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {msg}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-8 bg-white dark:bg-neutral-900 p-6 rounded-lg border border-neutral-300 dark:border-neutral-700"
        >
          {/* SECTION 1 — PERSONAL INFO */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Personal Information</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Full Name" required field="fullName" form={form} handleChange={handleChange} />
              <Input label="Email" type="email" required field="email" form={form} handleChange={handleChange} />
              <Input label="Phone Number" field="phone" form={form} handleChange={handleChange} />
              <Input label="Address" field="address" form={form} handleChange={handleChange} />
              <Input label="CNIC / National ID" field="cnic" form={form} handleChange={handleChange} />
              <Input label="Emergency Contact Name" field="emergencyName" form={form} handleChange={handleChange} />
              <Input label="Emergency Contact Number" field="emergencyPhone" form={form} handleChange={handleChange} />
            </div>
          </div>

          {/* SECTION 2 — JOB INFO */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Job / Payroll Information</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Department"
                field="department"
                form={form}
                handleChange={handleChange}
                options={[
                  "Sales",
                  "Finance",
                  "HR",
                  "Production",
                  "Account Manager",
                  "Admin Department",
                ]}
              />

              <Input label="Designation" field="designation" form={form} handleChange={handleChange} />

              <Input type="date" label="Joining Date" field="joiningDate" form={form} handleChange={handleChange} />

              <Select
                label="Contract Type"
                field="contractType"
                form={form}
                handleChange={handleChange}
                options={["Permanent", "Contract", "Intern"]}
              />

              <Input label="Shift Timings" field="shiftTimings" form={form} handleChange={handleChange} />
              <Input label="Salary" field="salary" form={form} handleChange={handleChange} />
              <Input label="Incentives" field="incentives" form={form} handleChange={handleChange} />
              <Input label="Commission %" field="commission" form={form} handleChange={handleChange} />
              <Input label="Monthly Target" field="monthlyTarget" form={form} handleChange={handleChange} />
              <Input label="Annual Leave Entitlement" field="leaveEntitlement" form={form} handleChange={handleChange} />
            </div>
          </div>

          {/* SECTION 3 — SYSTEM ACCESS */}
          <div>
            <h2 className="text-lg font-semibold mb-4">System Access</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                required
                label="Role"
                field="role"
                form={form}
                handleChange={handleChange}
                options={[
                  "SUPER_ADMIN",
                  "ADMIN",
                  "SALES_MANAGER",
                  "SALES",
                  "ACCOUNT_MANAGER",
                  "PRODUCTION",
                  "HR",
                  "FINANCE",
                  "CLIENT",
                ]}
              />

              <Input
                label="Account Password"
                required
                type="password"
                field="password"
                form={form}
                handleChange={handleChange}
              />

              <Select
                label="Account Status"
                field="status"
                form={form}
                handleChange={handleChange}
                options={["active", "inactive"]}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Notes</h2>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="w-full p-3 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
              rows={4}
              placeholder="Internal notes (optional)"
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create User"}
          </button>
        </form>
      </div>
    </RequireAuth>
  );
}

/* COMPONENTS */

function Input({ label, field, form, handleChange, type = "text", required = false }: any) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 font-medium">{label}</label>
      <input
        required={required}
        type={type}
        value={form[field]}
        onChange={(e) => handleChange(field, e.target.value)}
        className="p-2 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
      />
    </div>
  );
}

function Select({ label, field, form, handleChange, options, required = false }: any) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 font-medium">{label}</label>
      <select
        required={required}
        value={form[field]}
        onChange={(e) => handleChange(field, e.target.value)}
        className="p-2 rounded border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
      >
        <option value="">Select</option>
        {options.map((o: string) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
