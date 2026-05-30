import { getCurrentUser, _isProduction } from "../admin/_utils";

export type ProductionUser = {
  uid: string;
  role: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  [key: string]: unknown;
};

type ProjectAssignment = {
  productionUid?: string | null;
  productionOwnerId?: string | null;
  assignedProductionIds?: string[] | null;
};

export async function getProductionUser(): Promise<ProductionUser | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  const role = (me.role || "").toLowerCase().replace(/-/g, "_");
  if (!["production", "production_manager", "admin", "super_admin"].includes(role)) return null;
  return me as ProductionUser;
}

export function isAssignedToProduction(project: ProjectAssignment, uid: string) {
  if (!project) return false;
  if (project.productionUid && project.productionUid === uid) return true;
  if (project.productionOwnerId && project.productionOwnerId === uid) return true;
  if (Array.isArray(project.assignedProductionIds) && project.assignedProductionIds.includes(uid)) return true;
  return false;
}

export function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}
