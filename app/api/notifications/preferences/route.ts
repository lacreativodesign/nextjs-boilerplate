import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeTenantId } from '@/lib/tenant';
import { NotificationService } from '@/lib/notifications/notification-service';
import { NotificationCategory, NotificationPreferences } from '@/types/notifications';
import { getCurrentUser } from '../../admin/_utils';
import { requireNotificationsModule } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const categorySchema = z.enum([
  'system',
  'financial',
  'sales',
  'operations',
  'security',
  'team',
  'custom',
]);

const preferencesSchema = z.object({
  channels: z.object({
    inApp: z.boolean(),
    email: z.boolean(),
    sms: z.boolean(),
  }),
  categorySettings: z.record(
    categorySchema,
    z.object({
      enabled: z.boolean(),
      channels: z.array(z.enum(['in_app', 'email', 'sms', 'webhook'])),
      minPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    }),
  ),
  quietHours: z
    .object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
    })
    .optional(),
  emailDigest: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(['daily', 'weekly']),
      time: z.string(),
    })
    .optional(),
});

function ensureCategorySettings(settings: NotificationPreferences['categorySettings']) {
  const categories: NotificationCategory[] = [
    'system',
    'financial',
    'sales',
    'operations',
    'security',
    'team',
    'custom',
  ];

  const normalized = { ...settings } as NotificationPreferences['categorySettings'];
  categories.forEach((category) => {
    if (!normalized[category]) {
      normalized[category] = {
        enabled: true,
        channels: ['in_app', 'email'],
        minPriority: 'low',
      };
    }
  });

  return normalized;
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const moduleAccess = await requireNotificationsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const doc = await adminDb.collection('notification_preferences').doc(me.uid).get();

    if (!doc.exists) {
      return NextResponse.json({
        preferences: NotificationService.getDefaultPreferences(me.uid, tenantId),
      });
    }

    return NextResponse.json({
      preferences: { id: doc.id, ...doc.data() },
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const moduleAccess = await requireNotificationsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const body = await request.json();
    const data = preferencesSchema.parse(body);

    await adminDb
      .collection('notification_preferences')
      .doc(me.uid)
      .set(
        {
          ...data,
          categorySettings: ensureCategorySettings(
            data.categorySettings as NotificationPreferences['categorySettings'],
          ),
          tenantId,
          userId: me.uid,
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true },
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
