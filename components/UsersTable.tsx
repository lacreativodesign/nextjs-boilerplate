"use client";

import { User } from "@/types";
import { ArrowUpDown } from "lucide-react";

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
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return (
      <ArrowUpDown
        className={`w-4 h-4 ${
          sortDirection === "asc" ? "rotate-180" : ""
        } transition`}
      />
    );
  };

  return (
    <div className="overflow-x-auto border rounded-lg bg-white dark:bg-neutral-900">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 dark:bg-neutral-800">
          <tr>
            <th
              className="px-4 py-3 text-left cursor-pointer"
              onClick={() => onSort("displayName")}
            >
              <div className="flex items-center gap-1">
                Name {renderSortIcon("displayName")}
              </div>
            </th>

            <th
              className="px-4 py-3 text-left cursor-pointer"
              onClick={() => onSort("email")}
            >
              <div className="flex items-center gap-1">
                Email {renderSortIcon("email")}
              </div>
            </th>

            <th
              className="px-4 py-3 text-left cursor-pointer"
              onClick={() => onSort("role")}
            >
              <div className="flex items-center gap-1">
                Role {renderSortIcon("role")}
              </div>
            </th>

            <th className="px-4 py-3 text-left">Actions</th>
          </tr>
        </thead>

        <tbody>
          {users.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="text-center py-8 text-neutral-500 dark:text-neutral-400"
              >
                No users found.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr
                key={user.uid}
                className="border-t hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                <td className="px-4 py-3">{user.displayName}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3 uppercase text-xs font-medium">
                  {user.role}
                </td>

                <td className="px-4 py-3">
                  <button
                    onClick={() => onView(user.uid)}
                    className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs"
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
  );
              }
