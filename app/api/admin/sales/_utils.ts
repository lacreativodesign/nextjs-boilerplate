import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { createNotification } from '@/lib/notifications';
import { getCurrentUser, isAdminRole } from '../_utils';
import { isPlanAccessError, requireModule } from '../../../lib/plan-enforcement';

export const runtime = 'nodejs';

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function parseNumber(value: any, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function parseString(value: any, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export function arrayUnion(value: unknown) {
  return admin.firestore.FieldValue.arrayUnion(value);
}

export async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isAdminRole(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  try {
    await requireModule(me.tenantId, 'sales', { role: me.role });
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false as const, status: err.status, error: err.message };
    }
    return { ok: false as const, status: 500, error: 'Unable to validate plan access.' };
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
  await adminDb.collection('events').add({
    type,
    title,
    description,
    entityType: entityType || null,
    entityId: entityId || null,
    metadata: metadata || {},
    createdByUid: createdByUid || null,
    createdByName: createdByName || null,
    tenantId: tenantId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function queueSalesNotification({
  title,
  body,
  userId,
  metadata,
  tenantId,
}: {
  title: string;
  body: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
}) {
  if (!userId) return;
  await createNotification({
    toUserId: userId,
    title,
    body,
    type: 'info',
    entityType: 'client',
    createdBy: null,
    tenantId: tenantId || null,
    metadata: metadata || null,
  });
}

export async function queueSalesEmail({
  to,
  template,
  subject,
  data,
  metadata,
  tenantId,
}: {
  to: string;
  template: string;
  subject: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
}) {
  await adminDb.collection('emails').add({
    to,
    template,
    subject,
    data: data || {},
    metadata: metadata || {},
    status: 'pending',
    tenantId: tenantId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
