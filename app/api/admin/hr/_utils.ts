import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "../_utils";

export const runtime = "nodejs";

export function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export function isAdminLike(role?: string) {
  const normalized = normalizeRole(role || "");
  return normalized === "admin" || normalized === "super_admin";
}

export function isHrRole(role?: string) {
  return normalizeRole(role || "") === "hr";
}

export function canAccessHr(role?: string) {
  return isAdminLike(role) || isHrRole(role);
}

export async function requireHrAccess() {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (!canAccessHr(me.role)) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, user: me };
}

export async function createHrEvent({
  type,
  title,
  description,
  entityType,
  entityId,
  createdByUid,
  createdByName,
  metadata,
}: {
  type: string;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  createdByUid?: string;
  createdByName?: string;
  metadata?: Record<string, unknown>;
}) {
  await adminDb.collection("events").add({
    type,
    title,
    description,
    entityType: entityType || null,
    entityId: entityId || null,
    metadata: metadata || {},
    createdByUid: createdByUid || null,
    createdByName: createdByName || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createHrNotification({
  userId,
  title,
  message,
  type,
  metadata,
}: {
  userId: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  await adminDb.collection("notifications").add({
    userId,
    title,
    message,
    type,
    metadata: metadata || {},
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function queueHrEmail({
  to,
  subject,
  template,
  data,
  metadata,
}: {
  to: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  await adminDb.collection("emails").add({
    to,
    subject,
    template,
    data: data || {},
    metadata: metadata || {},
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
