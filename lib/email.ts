import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeTenantId } from '@/lib/tenant';

export type QueuedEmail = {
  tenantId: string;
  to: string;
  subject: string;
  html: string;
  status: 'queued' | 'sent' | 'failed';
  createdAt: FirebaseFirestore.FieldValue;
  sentAt?: FirebaseFirestore.FieldValue | null;
  error?: string | null;
};

export async function queueEmail({
  tenantId,
  to,
  subject,
  html,
}: {
  tenantId?: string | null;
  to: string;
  subject: string;
  html: string;
}) {
  const normalizedTenantId = normalizeTenantId(tenantId || null);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const payload: QueuedEmail = {
    tenantId: normalizedTenantId,
    to,
    subject,
    html,
    status: 'queued',
    createdAt: now,
  };

  const ref = adminDb.collection('emails').doc();
  await ref.set(payload);

  return { id: ref.id };
}
