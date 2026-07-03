'use client';

import { useState } from 'react';
import { OptimizedImage } from '@/components/OptimizedImage';

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
  const displayName = user.name || user.profile?.title || user.email || 'Unnamed User';

  const handleStatusChange = async () => {
    setIsLoading(true);
    try {
      const endpoint = isActive ? `/api/users/${user.id}` : `/api/users/${user.id}/reactivate`;
      const response = await fetch(endpoint, {
        method: isActive ? 'DELETE' : 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Unable to update status');
      }

      onUpdate();
    } catch (err: any) {
      alert(err?.message || 'Unable to update user status');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-[var(--surface-muted)] overflow-hidden flex items-center justify-center">
          {user.profile?.avatar ? (
            <OptimizedImage
              src={user.profile.avatar}
              alt={displayName}
              width={48}
              height={48}
              className="h-full w-full"
              sizes="48px"
            />
          ) : (
            <span className="text-sm font-semibold text-[var(--text-muted)]">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">{displayName}</div>
          <div className="text-xs text-[var(--text-muted)]">{user.email}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span className="uppercase tracking-wide">{user.role || 'staff'}</span>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            isActive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
          }`}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="text-xs text-[var(--text-muted)]">
        {user.profile?.title || 'No title'}
        {user.profile?.department ? ` • ${user.profile.department}` : ''}
      </div>

      <button
        onClick={handleStatusChange}
        disabled={isLoading}
        className={`btn ghost mt-auto ${
          isActive
            ? 'border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20'
            : 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900/40 dark:hover:bg-green-900/20'
        }`}
      >
        {isLoading ? 'Updating...' : isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
}
