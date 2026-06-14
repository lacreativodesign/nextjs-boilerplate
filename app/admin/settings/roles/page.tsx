"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomRoleBuilder } from "@/components/permissions/CustomRoleBuilder";
import { PermissionTemplateLibrary } from "@/components/permissions/PermissionTemplateLibrary";
import { RoleAssignmentInterface } from "@/components/permissions/RoleAssignmentInterface";
import { PermissionPreview } from "@/components/permissions/PermissionPreview";
import type { RoleDocument, UserPermissionSnapshot } from "@/lib/permissions/types";
import { apiFetch } from "@/lib/api/client";

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<RoleDocument[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; email?: string; name?: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [preview, setPreview] = useState<UserPermissionSnapshot | null>(null);
  const [error, setError] = useState("");

  async function loadRoles() {
    const res = await apiFetch("/api/permissions/roles", { cache: "no-store" });
    const data = await res.json();
    setRoles(data.roles || []);
  }

  async function loadUsers() {
    const res = await apiFetch("/api/users", { cache: "no-store" });
    const data = await res.json();
    const payload = Array.isArray(data.users) ? data.users : [];
    setUsers(payload.map((user: { id: string; email?: string; name?: string }) => ({ id: user.id, email: user.email, name: user.name })));
  }

  async function saveRole(payload: { name: string; description: string; parentRoleId?: string; permissions: RoleDocument["permissions"] }) {
    setError("");
    const res = await apiFetch("/api/permissions/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create role");
      return;
    }

    await loadRoles();
  }

  async function applyTemplate(templateKey: string) {
    setError("");
    const res = await apiFetch("/api/permissions/templates/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateKey }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Template apply failed");
      return;
    }

    await loadRoles();
  }

  async function assignRole(userId: string, roleId: string) {
    setError("");
    const res = await apiFetch(`/api/permissions/roles/${roleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedUserIds: [userId] }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Role assignment failed");
      return;
    }

    if (selectedUserId === userId) {
      const next = await apiFetch(`/api/permissions/user/${userId}`, { cache: "no-store" });
      setPreview(await next.json());
    }
  }

  useEffect(() => {
    void Promise.all([loadRoles(), loadUsers()]).catch(() => setError("Failed to load permission workspace"));
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setPreview(null);
      return;
    }

    void apiFetch(`/api/permissions/user/${selectedUserId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setPreview(data))
      .catch(() => setError("Failed to load permission preview"));
  }, [selectedUserId]);

  const roleOptions = useMemo(() => roles.map((role) => ({ id: role.id, name: role.name })), [roles]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Granular Permissions & Role Builder</h1>
        <p className="text-sm opacity-70">Field-level access control, role templates, and permission previews.</p>
      </div>

      {error ? <div className="rounded border border-red-400 bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}

      <CustomRoleBuilder onSave={saveRole} roleOptions={roleOptions} />
      <PermissionTemplateLibrary onApply={applyTemplate} />

      <div className="card" style={{ padding: 16 }}>
        <label className="mb-2 block text-xs font-semibold">Preview User</label>
        <select className="input" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
          <option value="">Select user</option>
          {users.map((user) => (
            <option value={user.id} key={user.id}>
              {user.name || user.email || user.id}
            </option>
          ))}
        </select>
      </div>

      <RoleAssignmentInterface users={users} roles={roleOptions} onAssign={assignRole} />
      <PermissionPreview snapshot={preview} />
    </div>
  );
}
