import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

export type NotificationType = "info" | "warning" | "success" | "system";

export type NotificationEntityType =
  | "project"
  | "client"
  | "invoice"
  | "payment"
  | "email"
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
  message?: string;
  type?: NotificationType;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  deepLink?: string | null;
  createdBy?: { uid?: string | null; name?: string | null } | null;
  priority?: "low" | "normal" | "high";
  tenantId?: string | null;
  roleTarget?: string | null;
};

export async function createNotification(payload: NotificationPayload) {
  try {
    const ref = adminDb.collection("notifications").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const message = payload.message ?? payload.body;

    await ref.set({
      id: ref.id,
      toUserId: payload.toUserId,
      title: payload.title,
      body: payload.body,
      message,
      type: payload.type || "info",
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
      deepLink: payload.deepLink || null,
      isRead: false,
      read: false,
      roleTarget: payload.roleTarget ?? "user",
      createdAt: now,
      updatedAt: now,
      createdBy: payload.createdBy || null,
      priority: payload.priority || "normal",
      tenantId: payload.tenantId || null,
    });
  } catch (error) {
    console.error("notification create error:", error);
  }
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
    tenantId: tenantId || null,
  });
}

export async function getUserIdsByRoles(roles: string[], tenantId?: string | null) {
  if (!roles.length) return [];
  let query: FirebaseFirestore.Query = adminDb.collection("users").where("role", "in", roles);
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => doc.id);
}

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}
