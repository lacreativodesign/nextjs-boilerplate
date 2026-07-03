import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

export type SecurityEvent = {
  type: string;
  message: string;
  path?: string;
  method?: string;
  actorUid?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditAction = {
  action: string;
  resource: string;
  resourceId?: string | null;
  actorUid?: string | null;
  tenantId?: string | null;
  status?: 'success' | 'failure';
  metadata?: Record<string, unknown>;
};

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  console.log('[SECURITY]', JSON.stringify(event));
  try {
    adminDb.collection('security_events').add({
      ...event,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    /* non-blocking */
  }
}

export async function logAuditTrail(action: AuditAction): Promise<void> {
  console.log('[AUDIT]', JSON.stringify(action));
  try {
    adminDb.collection('audit_trail').add({
      ...action,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    /* non-blocking */
  }
}
