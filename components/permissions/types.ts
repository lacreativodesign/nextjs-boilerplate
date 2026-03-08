import type { PermissionSet, RoleDocument } from "@/lib/permissions/types";

export type RoleFormState = {
  name: string;
  description: string;
  parentRoleId: string;
  permissions: PermissionSet[];
};

export type PermissionsUiRole = Pick<RoleDocument, "id" | "name" | "description" | "parentRoleId" | "permissions">;
