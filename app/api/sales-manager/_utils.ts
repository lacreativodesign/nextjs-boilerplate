import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { getCurrentUser, isAdminOrSuper, isSalesManager } from "../admin/_utils";

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
        entityType: entityType || "lead",
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

export function normalizeStage(stage?: string) {
  return parseString(stage, "").trim();
}

export function isClosedStage(stage?: string) {
  const token = String(stage || "").toLowerCase();
  return token.includes("closed");
}
