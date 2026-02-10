"use client";

import { User } from "@/types";
import { ArrowUpDown } from "lucide-react";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";

interface UsersTableProps {
  users: User[];
  onSort: (field: keyof User) => void;
  sortField: keyof User;
  sortDirection: "asc" | "desc";
  onView: (uid: string) => void;
}

export default function UsersTable({
  users,
  onSort,
  sortField,
  sortDirection,
  onView,
}: UsersTableProps) {
  const renderSortIcon = (field: keyof User) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-40" />;
    }
    return <ArrowUpDown className={`h-4 w-4 ${sortDirection === "asc" ? "rotate-180" : ""} transition`} />;
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">Failed to load users table.</p>
        </div>
      }
    >
      <div className="overflow-x-auto rounded-lg border bg-white dark:bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 dark:bg-neutral-800">
            <tr>
              <th className="cursor-pointer px-4 py-3 text-left" onClick={() => onSort("displayName")}>
                <div className="flex items-center gap-1">Name {renderSortIcon("displayName")}</div>
              </th>

              <th className="cursor-pointer px-4 py-3 text-left" onClick={() => onSort("email")}>
                <div className="flex items-center gap-1">Email {renderSortIcon("email")}</div>
              </th>

              <th className="cursor-pointer px-4 py-3 text-left" onClick={() => onSort("role")}>
                <div className="flex items-center gap-1">Role {renderSortIcon("role")}</div>
              </th>

              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-neutral-500 dark:text-neutral-400">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.uid} className="border-t hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="px-4 py-3">{user.displayName}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3 text-xs font-medium uppercase">{user.role}</td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => onView(user.uid)}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ErrorBoundary>
  );
}
