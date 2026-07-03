'use client';

import { useEffect, useState } from 'react';
import { InviteUserDialog } from '@/components/users/InviteUserDialog';
import { UserCard, type UserCardData } from '@/components/users/UserCard';

export default function UsersPage() {
  const [users, setUsers] = useState<UserCardData[]>([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Unable to load users');
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [filter]);

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-sm text-gray-500">
            Manage invitations, roles, and access across your organization.
          </p>
        </div>
        <InviteUserDialog onSuccess={fetchUsers} />
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Inactive' },
        ].map((status) => (
          <button
            key={status.key}
            onClick={() => setFilter(status.key)}
            className={`px-4 py-2 font-medium ${
              filter === status.key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-sm text-gray-500">No users found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((user) => (
            <UserCard key={user.id} user={user} onUpdate={fetchUsers} />
          ))}
        </div>
      )}
    </div>
  );
}
