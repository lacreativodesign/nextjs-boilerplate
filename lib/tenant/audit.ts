import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';

type AuditLogInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  actionType: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog({
  tenantId = null,
  actorUserId = null,
  actorName = null,
  actorRole = null,
  actionType,
  entityType,
  entityId,
  metadata = {},
}: AuditLogInput) {
  const ref = adminDb.collection('auditLogs').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await ref.set({
    id: ref.id,
    tenantId,
    actorUserId,
    actorName,
    actorRole,
    actionType,
    entityType,
    entityId,
    metadata,
    createdAt: now,
    // P3-1a: superset fields so the compliance / audit-logs readers (which query by
    // `timestamp` and `userId` and default status) see entries written through this helper.
    timestamp: now,
    userId: actorUserId,
    status: 'success',
    // P3-1b: dialect-2 mirrors so entries are fully populated in the compliance/export/search
    // readers too (which read `action`, `resource`, `userName`), not just the super_admin viewer.
    action: actionType,
    resource: entityType,
    userName: actorName,
  });

  return { id: ref.id };
}
