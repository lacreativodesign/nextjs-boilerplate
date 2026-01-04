import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

type AuditLogInput = {
  tenantId?: string | null;
  actorUserId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog({
  tenantId = null,
  actorUserId,
  actionType,
  entityType,
  entityId,
  metadata = {},
}: AuditLogInput) {
  const ref = adminDb.collection("auditLogs").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await ref.set({
    tenantId,
    actorUserId,
    actionType,
    entityType,
    entityId,
    metadata,
    createdAt: now,
  });

  return { id: ref.id };
}
