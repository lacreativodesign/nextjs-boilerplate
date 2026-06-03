import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles, type NotificationEntityType } from "@/lib/notifications";
import { getCurrentUser, isAdminOrSuper, isSalesManager, normalizeRole } from "../admin/_utils";

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

export function nowIso() {
  return new Date().toISOString();
}

export function isSales(role?: string) {
  return normalizeRole(role) === "sales";
}

export function canReadSales(role?: string) {
  return isSales(role) || isSalesManager(role || "") || isAdminOrSuper(role || "");
}

export function canWriteSales(role?: string) {
  return isSales(role) || isSalesManager(role || "") || isAdminOrSuper(role || "");
}

export async function requireSalesRead() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!canReadSales(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export async function requireSalesWrite() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!canWriteSales(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export function userLabel(user: Record<string, any> | null) {
  if (!user) return "";
  return String(user.name || user.fullName || user.email || "Sales");
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

export async function getWatcherUserIds(tenantId?: string | null) {
  const ids = await getUserIdsByRoles(["admin", "super_admin", "sales_manager"], tenantId);
  return ids;
}

export async function getUserNameById(uid?: string | null) {
  if (!uid) return "";
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return "";
  const data = snap.data() || {};
  return String(data.name || data.fullName || data.email || "");
}

export async function getSalesSettings() {
  const snap = await adminDb.collection("settings").doc("sales").get();
  const data = snap.exists ? snap.data() : {};
  return {
    discountApprovalThresholdPct: parseNumber(data?.discountApprovalThresholdPct, 0),
  };
}

export function normalizeStage(stage?: string) {
  const value = parseString(stage, "").trim();
  if (!value) return value;
  const lower = value.toLowerCase();
  if (lower === "new") return "New Lead";
  return value;
}

export function isClosedStage(stage?: string) {
  const token = String(stage || "").toLowerCase();
  return token.includes("closed");
}
