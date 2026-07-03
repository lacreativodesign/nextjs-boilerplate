'use client';

type UserRecord = { id: string; email?: string; name?: string };
type RoleRecord = { id: string; name: string };

type Props = {
  users: UserRecord[];
  roles: RoleRecord[];
  onAssign: (userId: string, roleId: string) => Promise<void>;
};

export function RoleAssignmentInterface({ users, roles, onAssign }: Props) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="mb-3 text-sm font-semibold">Role Assignment Interface</h3>
      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className="flex items-center gap-2 rounded border p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{user.name || user.email || user.id}</div>
            </div>
            <select
              className="input w-52"
              onChange={(event) => {
                if (event.target.value) void onAssign(user.id, event.target.value);
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Assign role
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
