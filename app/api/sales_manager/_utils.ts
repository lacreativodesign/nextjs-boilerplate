import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles, type NotificationEntityType } from "@/lib/notifications";
import { getCurrentUser, isAdminOrSuper, isSalesManager } from "../admin/_utils";
import { isPlanAccessError, requireModule } from "../../lib/plan-enforcement";
import { TeamService } from "@/lib/teams/team-service";

export const runtime = "nodejs";

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function parseNumber(value: any, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function parseString(value: any, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function parseBoolean(value: any, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export function arrayUnion(value: unknown) {
  return admin.firestore.FieldValue.arrayUnion(value);
}

export async function requireSalesManager() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isSalesManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export async function requireSalesReportsAccess() {
  const auth = await requireSalesManager();
  if (!auth.ok) {
    return auth;
  }
  try {
    await requireModule(auth.user.tenantId, "reports", { role: auth.user.role });
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false as const, status: err.status, error: err.message };
    }
    return { ok: false as const, status: 500, error: "Unable to validate plan access." };
  }
  return auth;
}

export async function createSalesEvent({
  type,
  title,
  description,
  entityType,
  entityId,
  createdByUid,
  createdByName,
  metadata,
  tenantId,
}: {
  type: string;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  createdByUid?: string;
  createdByName?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
}) {
  await createNotificationEvent({
    type,
    title,
    description,
    entityType,
    entityId,
    createdByUid,
    createdByName,
    metadata,
    tenantId: tenantId || null,
  });
}

export async function notifyUsers({
  userIds,
  title,
  body,
  deepLink,
  entityType,
  entityId,
  createdBy,
  tenantId,
}: {
  userIds: string[];
  title: string;
  body: string;
  deepLink?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdBy?: { uid?: string | null; name?: string | null } | null;
  tenantId?: string | null;
}) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(
    uniqueIds.map((uid) =>
      createNotification({
        toUserId: uid,
        title,
        body,
        type: "info",
        entityType: (entityType || "lead") as NotificationEntityType,
        entityId: entityId || null,
        deepLink: deepLink || null,
        createdBy: createdBy || null,
        tenantId: tenantId || null,
      })
    )
  );
}

export async function getAdminUserIds(tenantId?: string | null) {
  const ids = await getUserIdsByRoles(["admin", "super_admin"], tenantId);
  return ids;
}

export async function getSalesSettings(tenantId?: string | null) {
  const settingsDocId = tenantId || "sales";
  const snap = await adminDb.collection("settings").doc(settingsDocId).get();
  const data = snap.exists ? snap.data() : {};
  return {
    discountApprovalThresholdPct: parseNumber(data?.discountApprovalThresholdPct, 0),
  };
}

export function normalizeStage(stage?: string) {
  return parseString(stage, "").trim();
}

export function isClosedStage(stage?: string) {
  const token = String(stage || "").toLowerCase();
  return token.includes("closed");
}

/**
 * Returns the set of member IDs for the manager's team, or null when:
 * - the user is admin/super_admin (sees everything), OR
 * - the manager has no team assigned (fallback: show all tenant data).
 */
export async function getSalesManagerTeamMemberIds(user: {
  uid: string;
  role: string;
  tenantId?: string | null;
}): Promise<string[] | null> {
  if (isAdminOrSuper(user.role)) return null;
  return TeamService.getManagerTeamMemberIds(user.uid, user.tenantId || "");
}
