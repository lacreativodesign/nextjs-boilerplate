import { getCurrentUser, isAccountManager } from "../admin/_utils";

export type AMUser = {
  uid: string;
  role: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  [key: string]: unknown;
};

export async function getAmUser(): Promise<AMUser | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isAccountManager(me.role)) return null;
  return me as AMUser;
}

export function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function isOwnedByAm(project: {
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  createdByUid?: string | null;
}, uid: string) {
  if (!project) return false;
  if (project.ownerAmUid && project.ownerAmUid === uid) return true;
  if (project.ownerId && project.ownerId === uid) return true;
  if (project.amId && project.amId === uid) return true;
  return false;
}
