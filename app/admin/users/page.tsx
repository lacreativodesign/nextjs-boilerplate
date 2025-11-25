"use client";

import { useEffect, useState } from "react";
import UsersTable from "@/components/UsersTable";
import { User } from "@/types";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<keyof User>("displayName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/admin/users/list");
        if (!res.ok) throw new Error("Failed to load users");
        const data = await res.json();
        setUsers(data.users || []);
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const handleSort = (field: keyof User) => {
    const direction = field === sortField && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(direction);

    const sorted = [...users].sort((a, b) => {
      const x = (a[field] || "").toString().toLowerCase();
      const y = (b[field] || "").toString().toLowerCase();
      if (x < y) return direction === "asc" ? -1 : 1;
      if (x > y) return direction === "asc" ? 1 : -1;
      return 0;
    });

    setUsers(sorted);
  };

  const handleView = (uid: string) => {
    router.push(`/admin/view-users/${uid}`);
  };

  if (loading) {
    return (
      <RequireAuth allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
        <div className="p-6">Loading users...</div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">All Users</h1>
          <button
            onClick={() => router.push("/admin/users/create")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create User
          </button>
        </div>

        <UsersTable
          users={users}
          onSort={handleSort}
          sortField={sortField}
          sortDirection={sortDirection}
          onView={handleView}
        />
      </div>
    </RequireAuth>
  );
}
