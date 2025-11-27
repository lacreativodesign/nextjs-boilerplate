"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";

export default function CreateUserPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          email,
          password,
          role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to create user");
        setLoading(false);
        return;
      }

      router.push("/admin/users");
    } catch (err) {
      console.error(err);
      setErrorMsg("Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-6">Create User</h1>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-neutral-900 p-6 rounded-lg border"
        >
          <div>
            <label className="block mb-1">Full Name</label>
            <input
              type="text"
              required
              className="w-full p-2 rounded border bg-neutral-100 dark:bg-neutral-800"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full p-2 rounded border bg-neutral-100 dark:bg-neutral-800"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full p-2 rounded border bg-neutral-100 dark:bg-neutral-800"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1">Role</label>
            <select
              required
              className="w-full p-2 rounded border bg-neutral-100 dark:bg-neutral-800"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">Select a role</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="ADMIN">ADMIN</option>
              <option value="SALES_MANAGER">SALES_MANAGER</option>
              <option value="SALES">SALES</option>
              <option value="ACCOUNT_MANAGER">ACCOUNT_MANAGER</option>
              <option value="PRODUCTION">PRODUCTION</option>
              <option value="HR">HR</option>
              <option value="FINANCE">FINANCE</option>
              <option value="CLIENT">CLIENT</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </RequireAuth>
  );
}
