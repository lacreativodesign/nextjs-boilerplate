"use client";

import { useState } from "react";

export default function CreateUserPage() {
  const [loading, setLoading] = useState(false);

  async function handleCreateUser(e: any) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries()) as any;

    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed");

      alert("User created successfully!");
      e.target.reset();
    } catch (err) {
      alert("Failed to create user");
    }

    setLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* PAGE TITLE */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Create User</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Add a new team member to the La Creativo ERP system.
        </p>
      </div>

      {/* FORM */}
      <form onSubmit={handleCreateUser} className="space-y-6 bg-white dark:bg-[#111113] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">

        {/* FULL NAME */}
        <FormInput
          label="Full Name"
          name="name"
          placeholder="Enter full name"
          required
        />

        {/* EMAIL */}
        <FormInput
          label="Email"
          name="email"
          type="email"
          placeholder="Enter email address"
          required
        />

        {/* PASSWORD */}
        <FormInput
          label="Password"
          name="password"
          type="password"
          placeholder="Set a login password"
          required
        />

        {/* ROLE */}
        <div className="flex flex-col gap-2">
          <label className="font-semibold text-sm">Role</label>
          <select
            name="role"
            required
            className="p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0f0f11]"
          >
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="SALES_MANAGER">Sales Manager</option>
            <option value="SALES">Sales</option>
            <option value="ACCOUNT_MANAGER">Account Manager</option>
            <option value="PRODUCTION">Production</option>
            <option value="HR">HR</option>
            <option value="FINANCE">Finance</option>
          </select>
        </div>

        {/* CONTACT INFO */}
        <FormInput label="Contact Number" name="phone" placeholder="0300-0000000" />

        <FormInput label="CNIC" name="cnic" placeholder="42101-0000000-0" />

        <FormInput label="Address" name="address" placeholder="House, Street, City" />

        {/* DATES */}
        <FormInput label="Joining Date" name="joiningDate" type="date" required />

        <FormInput label="Date of Birth" name="dob" type="date" />

        {/* SALARY */}
        <FormInput
          label="Salary (Rs.)"
          name="salary"
          type="number"
          placeholder="50000"
        />

        {/* TARGET (USD) */}
        <FormInput
          label="Monthly Target (USD $)"
          name="targetMonthly"
          type="number"
          placeholder="1000"
        />

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? "Creating user..." : "Create User"}
        </button>
      </form>
    </div>
  );
}

/* --------------------------------------------------------
   REUSABLE FORM INPUT COMPONENT (with border added)
--------------------------------------------------------- */
function FormInput({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
}: any) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-semibold text-sm">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="
          p-3
          rounded-lg
          border border-gray-300 
          dark:border-gray-700
          bg-white 
          dark:bg-[#0f0f11]
          text-gray-800 
          dark:text-gray-200
          outline-none
        "
      />
    </div>
  );
}
