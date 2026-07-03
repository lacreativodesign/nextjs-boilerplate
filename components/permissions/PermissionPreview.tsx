'use client';

import type { UserPermissionSnapshot } from '@/lib/permissions/types';

type Props = {
  snapshot: UserPermissionSnapshot | null;
};

export function PermissionPreview({ snapshot }: Props) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="mb-3 text-sm font-semibold">Permission Preview</h3>
      {!snapshot ? (
        <div className="text-xs opacity-70">Select user to preview effective permissions.</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs">
            Roles: {snapshot.roles.map((role) => role.name).join(', ') || 'None'}
          </div>
          {snapshot.permissions.map((permission, index) => (
            <div
              key={`${permission.module}-${permission.entity}-${index}`}
              className="rounded border p-2 text-xs"
            >
              <div className="font-semibold">
                {permission.module}/{permission.entity}
              </div>
              <div>Actions: {permission.actions.join(', ')}</div>
              <div>Fields: {JSON.stringify(permission.fields || {})}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
