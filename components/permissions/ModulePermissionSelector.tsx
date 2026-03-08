"use client";

import type { PermissionAction, PermissionSet } from "@/lib/permissions/types";

const ACTIONS: PermissionAction[] = ["create", "read", "update", "delete", "export"];

type Props = {
  permissions: PermissionSet[];
  onChange: (permissions: PermissionSet[]) => void;
};

export function ModulePermissionSelector({ permissions, onChange }: Props) {
  function updatePermission(index: number, key: keyof PermissionSet, value: string) {
    const next = [...permissions];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  }

  function toggleAction(index: number, action: PermissionAction) {
    const next = [...permissions];
    const existing = new Set(next[index].actions);
    if (existing.has(action)) existing.delete(action);
    else existing.add(action);
    next[index] = { ...next[index], actions: Array.from(existing) };
    onChange(next);
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="mb-3 text-sm font-semibold">Module Permission Selector</h3>
      <div className="space-y-3">
        {permissions.map((permission, index) => (
          <div key={`${permission.module}-${permission.entity}-${index}`} className="rounded border p-3">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="module"
                value={permission.module}
                onChange={(event) => updatePermission(index, "module", event.target.value)}
              />
              <input
                className="input"
                placeholder="entity"
                value={permission.entity}
                onChange={(event) => updatePermission(index, "entity", event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((action) => (
                <button
                  type="button"
                  key={action}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ background: permission.actions.includes(action) ? "var(--primary)" : "transparent", color: permission.actions.includes(action) ? "white" : "inherit" }}
                  onClick={() => toggleAction(index, action)}
                >
                  {action.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
