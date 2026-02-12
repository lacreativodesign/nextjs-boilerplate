export const PERMISSION_ACTIONS = ["create", "read", "update", "delete", "export"] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const FIELD_ACCESS_LEVELS = ["hidden", "read", "write"] as const;

export type FieldAccess = (typeof FIELD_ACCESS_LEVELS)[number];

export type PermissionSet = {
  module: string;
  entity: string;
  actions: PermissionAction[];
  fields?: Record<string, FieldAccess>;
  ownOnly?: boolean;
};

export type RoleDocument = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  permissions: PermissionSet[];
  parentRoleId?: string | null;
  isTemplate?: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type RoleAssignmentDocument = {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  assignedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type PermissionTemplate = {
  key: string;
  name: string;
  description: string;
  parentRoleId?: string | null;
  permissions: PermissionSet[];
};

export type PermissionCheckInput = {
  tenantId: string;
  userId: string;
  baseRole?: string | null;
  module: string;
  entity: string;
  action: PermissionAction;
  field?: string;
  ownerId?: string | null;
};

export type PermissionCheckResult = {
  allowed: boolean;
  fieldAccess: FieldAccess;
  reason?: string;
};

export type UserPermissionSnapshot = {
  tenantId: string;
  userId: string;
  roleIds: string[];
  roles: Pick<RoleDocument, "id" | "name" | "description" | "parentRoleId">[];
  permissions: PermissionSet[];
};
