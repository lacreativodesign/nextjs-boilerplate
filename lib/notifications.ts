import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

export type NotificationType = "info" | "warning" | "success" | "system";

export type NotificationEntityType =
  | "project"
  | "client"
  | "invoice"
  | "payment"
  | "change_request"
  | "hr"
  | "lead"
  | "deal"
  | "follow_up"
  | "campaign";

export type NotificationPayload = {
  toUserId: string;
  title: string;
  body: string;
  type?: NotificationType;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  deepLink?: string | null;
  createdBy?: { uid?: string | null; name?: string | null } | null;
  priority?: "low" | "normal" | "high";
};

export async function createNotification(payload: NotificationPayload) {
  const ref = adminDb.collection("notifications").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await ref.set({
    id: ref.id,
    toUserId: payload.toUserId,
    title: payload.title,
    body: payload.body,
    type: payload.type || "info",
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    deepLink: payload.deepLink || null,
    isRead: false,
    createdAt: now,
    updatedAt: now,
    createdBy: payload.createdBy || null,
    priority: payload.priority || "normal",
  });
}

export async function createNotificationEvent({
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
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
  });
}

export async function getUserIdsByRoles(roles: string[]) {
  if (!roles.length) return [];
  const snap = await adminDb.collection("users").where("role", "in", roles).get();
  return snap.docs.map((doc) => doc.id);
}

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}
