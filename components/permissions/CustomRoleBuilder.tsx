"use client";

import { useState } from "react";
import type { PermissionSet } from "@/lib/permissions/types";
import { ModulePermissionSelector } from "@/components/permissions/ModulePermissionSelector";
import { FieldAccessToggles } from "@/components/permissions/FieldAccessToggles";

type Props = {
  onSave: (payload: { name: string; description: string; parentRoleId?: string; permissions: PermissionSet[] }) => Promise<void>;
  roleOptions: Array<{ id: string; name: string }>;
};

export function CustomRoleBuilder({ onSave, roleOptions }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentRoleId, setParentRoleId] = useState("");
  const [permissions, setPermissions] = useState<PermissionSet[]>([{ module: "", entity: "", actions: ["read"] }]);

  return (
    <div className="space-y-4">
      <div className="card" style={{ padding: 16 }}>
        <h3 className="mb-3 text-sm font-semibold">Custom Role Builder</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <input className="input" placeholder="Role name" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="input" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
          <select className="input md:col-span-2" value={parentRoleId} onChange={(event) => setParentRoleId(event.target.value)}>
            <option value="">No inheritance</option>
            {roleOptions.map((role) => (
              <option value={role.id} key={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="rounded border px-3 py-1 text-xs" onClick={() => setPermissions((prev) => [...prev, { module: "", entity: "", actions: ["read"] }])}>
            Add Entity
          </button>
          <button className="rounded border px-3 py-1 text-xs" onClick={() => onSave({ name, description, parentRoleId, permissions })}>
            Save Role
          </button>
        </div>
      </div>

      <ModulePermissionSelector permissions={permissions} onChange={setPermissions} />
      <FieldAccessToggles permissions={permissions} onChange={setPermissions} />
    </div>
  );
}
