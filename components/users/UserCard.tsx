"use client";

import { useState } from "react";

export type UserCardData = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  isActive?: boolean;
  profile?: {
    title?: string;
    department?: string;
    avatar?: string;
  } | null;
};

type UserCardProps = {
  user: UserCardData;
  onUpdate: () => void;
};

export function UserCard({ user, onUpdate }: UserCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const isActive = user.isActive !== false;
  const displayName = user.name || user.profile?.title || user.email || "Unnamed User";

  const handleStatusChange = async () => {
    setIsLoading(true);
    try {
      const endpoint = isActive
        ? `/api/users/${user.id}`
        : `/api/users/${user.id}/reactivate`;
      const response = await fetch(endpoint, {
        method: isActive ? "DELETE" : "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Unable to update status");
      }

      onUpdate();
    } catch (err: any) {
      alert(err?.message || "Unable to update user status");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
          {user.profile?.avatar ? (
            <img
              src={user.profile.avatar}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-500">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{displayName}</div>
          <div className="text-xs text-gray-500">{user.email}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="uppercase tracking-wide">{user.role || "staff"}</span>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="text-xs text-gray-500">
        {user.profile?.title || "No title"}
        {user.profile?.department ? ` • ${user.profile.department}` : ""}
      </div>

      <button
        onClick={handleStatusChange}
        disabled={isLoading}
        className={`mt-auto rounded border px-3 py-2 text-sm font-medium ${
          isActive
            ? "border-red-200 text-red-600 hover:bg-red-50"
            : "border-green-200 text-green-600 hover:bg-green-50"
        }`}
      >
        {isLoading ? "Updating..." : isActive ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}
