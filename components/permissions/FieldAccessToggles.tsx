'use client';

import type { FieldAccess, PermissionSet } from '@/lib/permissions/types';

const LEVELS: FieldAccess[] = ['hidden', 'read', 'write'];

type Props = {
  permissions: PermissionSet[];
  onChange: (permissions: PermissionSet[]) => void;
};

export function FieldAccessToggles({ permissions, onChange }: Props) {
  function setFieldAccess(index: number, field: string, level: FieldAccess) {
    const next = [...permissions];
    const fields = { ...(next[index].fields || {}) };
    fields[field] = level;
    next[index] = { ...next[index], fields };
    onChange(next);
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="mb-3 text-sm font-semibold">Field-level Access Toggles</h3>
      <div className="space-y-2">
        {permissions.map((permission, index) => (
          <div
            key={`${permission.module}-${permission.entity}-${index}`}
            className="rounded border p-3"
          >
            <div className="mb-2 text-xs font-semibold uppercase">
              {permission.module || 'module'} / {permission.entity || 'entity'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['email', 'internalNotes', 'creditLimit'].map((field) => (
                <div key={field} className="rounded border p-2">
                  <div className="mb-2 text-xs">{field}</div>
                  <select
                    className="input"
                    value={permission.fields?.[field] || 'write'}
                    onChange={(event) =>
                      setFieldAccess(index, field, event.target.value as FieldAccess)
                    }
                  >
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
