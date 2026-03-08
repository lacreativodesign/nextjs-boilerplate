import { getCurrentUser, isProduction } from "../admin/_utils";

export type ProductionUser = {
  uid: string;
  role: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  [key: string]: any;
};

type ProjectAssignment = {
  productionUid?: string | null;
  productionOwnerId?: string | null;
  assignedProductionIds?: string[] | null;
};

export async function getProductionUser(): Promise<ProductionUser | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isProduction(me.role)) return null;
  return me as ProductionUser;
}

export function isAssignedToProduction(project: ProjectAssignment, uid: string) {
  if (!project) return false;
  if (project.productionUid && project.productionUid === uid) return true;
  if (project.productionOwnerId && project.productionOwnerId === uid) return true;
  if (Array.isArray(project.assignedProductionIds) && project.assignedProductionIds.includes(uid)) return true;
  return false;
}

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}
