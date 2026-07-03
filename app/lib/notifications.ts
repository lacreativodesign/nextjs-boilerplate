import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  NotificationPreferenceService,
  type NotificationDispatchRequest,
} from '@/lib/notifications/preferences';
import { normalizeTenantId } from '@/lib/tenant';
import type { Role } from './permissions';

export type NotificationType =
  | 'approval_requested'
  | 'approval_decision'
  | 'new_lead'
  | 'deal_paid'
  | 'project_created'
  | 'change_request'
  | 'delivery_completed'
  | 'info'
  | 'warning'
  | 'success'
  | 'system';

export type NotificationEntityType =
  | 'lead'
  | 'deal'
  | 'project'
  | 'task'
  | 'approval'
  | 'change_request'
  | 'subscription'
  | 'tenant'
  | 'client'
  | 'invoice'
  | 'payment'
  | 'hr'
  | 'payroll';

export type NotificationRecipient = {
  uid: string;
  role?: string | null;
  tenantId?: string | null;
};

export type NotificationPayload = {
  recipientUid?: string;
  recipientRole?: string | null;
  toUserId?: string;
  title: string;
  body?: string;
  message?: string;
  type?: NotificationType;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  deepLink?: string | null;
  createdBy?: { uid?: string | null; name?: string | null } | null;
  priority?: 'low' | 'normal' | 'high';
  tenantId?: string | null;
  roleTarget?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ResolvedRecipient = {
  uid: string;
  role: Role;
  tenantId: string;
};

const ROLE_VALUES: Role[] = [
  'super_admin',
  'admin',
  'sales_manager',
  'sales',
  'am_manager',
  'am',
  'production_manager',
  'production',
  'finance',
  'hr',
  'client',
];

function normalizeRole(role?: string | null): Role | null {
  const normalized = String(role || '')
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/^account_manager$/, 'am');
  return ROLE_VALUES.includes(normalized as Role) ? (normalized as Role) : null;
}

async function resolveRecipient(
  recipient: NotificationRecipient,
): Promise<ResolvedRecipient | null> {
  if (!recipient.uid) return null;
  const providedRole = normalizeRole(recipient.role || null);
  const providedTenant = recipient.tenantId ? normalizeTenantId(recipient.tenantId) : null;

  if (providedRole && providedTenant) {
    return { uid: recipient.uid, role: providedRole, tenantId: providedTenant };
  }

  const snap = await adminDb.collection('users').doc(recipient.uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const resolvedRole = providedRole || normalizeRole(String(data.role || '')) || 'sales';
  const resolvedTenant = providedTenant || normalizeTenantId(String(data.tenantId || ''));
  return { uid: recipient.uid, role: resolvedRole, tenantId: resolvedTenant };
}

function mapPayloadTypeToEventType(
  type?: NotificationType,
): NotificationDispatchRequest['eventType'] {
  switch (type) {
    case 'approval_requested':
      return 'approval_pending';
    case 'approval_decision':
      return 'approval_approved';
    case 'delivery_completed':
      return 'project_milestone_reached';
    case 'deal_paid':
      return 'invoice_paid';
    case 'warning':
      return 'system_maintenance';
    default:
      return 'system_updates';
  }
}

function uniqueRecipients(recipients: NotificationRecipient[]) {
  const map = new Map<string, NotificationRecipient>();
  recipients.forEach((recipient) => {
    if (!recipient.uid) return;
    map.set(recipient.uid, recipient);
  });
  return Array.from(map.values());
}

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export async function createNotifications({
  recipients,
  ...payload
}: NotificationPayload & { recipients: NotificationRecipient[] }) {
  try {
    if (!recipients.length) return;
    const unique = uniqueRecipients(recipients);
    if (!unique.length) return;
    const message = payload.message ?? payload.body ?? '';
    if (!payload.title && !message) return;

    const resolved = await Promise.all(unique.map((recipient) => resolveRecipient(recipient)));
    const usable = resolved.filter(Boolean) as ResolvedRecipient[];
    if (!usable.length) return;

    const now = nowTimestamp();
    const notificationsRef = adminDb.collection('notifications');
    const batch = adminDb.batch();
    const payloadTenant = payload.tenantId ? normalizeTenantId(payload.tenantId) : null;
    const eventType = mapPayloadTypeToEventType(payload.type);
    let writes = 0;

    for (const { uid, role, tenantId } of usable) {
      const ref = notificationsRef.doc();
      const scopedTenantId = payloadTenant || tenantId;
      if (!scopedTenantId) continue;

      const preferenceCheck = await NotificationPreferenceService.shouldSendNow({
        tenantId: scopedTenantId,
        userId: uid,
        eventType,
        title: payload.title,
        message,
        actionUrl: payload.deepLink || undefined,
        metadata: (payload.metadata || {}) as Record<string, unknown>,
      });

      if (!preferenceCheck.deliverNow && preferenceCheck.reason !== 'digest') {
        continue;
      }

      if (!preferenceCheck.deliverNow && preferenceCheck.reason === 'digest') {
        await NotificationPreferenceService.queueDigestItem(
          {
            tenantId: scopedTenantId,
            userId: uid,
            eventType,
            title: payload.title,
            message,
            actionUrl: payload.deepLink || undefined,
            metadata: (payload.metadata || {}) as Record<string, unknown>,
          },
          preferenceCheck.frequency as 'hourly' | 'daily' | 'weekly',
        );
        continue;
      }

      batch.set(ref, {
        id: ref.id,
        tenantId: scopedTenantId,
        recipientUid: uid,
        userId: uid,
        recipientRole: role,
        type: payload.type || 'system',
        title: payload.title,
        message,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
        isRead: false,
        createdAt: now,
        toUserId: uid,
        body: payload.body || message,
        read: false,
        updatedAt: now,
        deepLink: payload.deepLink || null,
        createdBy: payload.createdBy || null,
        priority: payload.priority || 'normal',
        roleTarget: payload.roleTarget || role,
        metadata: payload.metadata || null,
      });
      writes += 1;
    }

    if (writes > 0) {
      await batch.commit();
    }
  } catch (error) {
    console.error('notification create error:', error);
  }
}

export async function createNotification(payload: NotificationPayload) {
  const recipientUid = payload.recipientUid || payload.toUserId;
  if (!recipientUid) return;
  await createNotifications({
    ...payload,
    recipients: [
      {
        uid: recipientUid,
        role: payload.recipientRole || payload.roleTarget || null,
        tenantId: payload.tenantId || null,
      },
    ],
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
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    tenantId: tenantId || null,
  });
}

export async function getUsersByRoles(roles: string[], tenantId?: string | null) {
  if (!roles.length) return [];
  let query: FirebaseFirestore.Query = adminDb.collection('users').where('role', 'in', roles);
  if (tenantId) {
    query = query.where('tenantId', '==', normalizeTenantId(tenantId));
  }
  const snap = await query.get();
  return snap.docs.map((doc) => ({
    uid: doc.id,
    role: String(doc.data()?.role || ''),
    tenantId: String(doc.data()?.tenantId || ''),
    email: String(doc.data()?.email || ''),
  }));
}

export async function getUserIdsByRoles(roles: string[], tenantId?: string | null) {
  const users = await getUsersByRoles(roles, tenantId);
  return users.map((user) => user.uid);
}

export async function createRoleNotifications({
  roles,
  tenantId,
  recipientTenantId,
  ...payload
}: NotificationPayload & {
  roles: string[];
  tenantId: string | null;
  recipientTenantId?: string | null;
}) {
  const users = await getUsersByRoles(roles, recipientTenantId ?? tenantId);
  if (!users.length) return;
  await createNotifications({
    ...payload,
    tenantId,
    recipients: users.map((user) => ({
      uid: user.uid,
      role: user.role,
      tenantId: user.tenantId,
    })),
  });
}
