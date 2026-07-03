import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import {
  USER_NOTIFICATION_CHANNELS,
  USER_NOTIFICATION_EVENT_TYPES,
} from '@/lib/notifications/preferences-config';
import { NotificationPreferenceService } from '@/lib/notifications/preferences';
import { normalizeTenantId } from '@/lib/tenant';
import type { UserNotificationPreferences } from '@/types/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const channelSchema = z
  .string()
  .refine((value): value is (typeof USER_NOTIFICATION_CHANNELS)[number] => {
    return USER_NOTIFICATION_CHANNELS.includes(
      value as (typeof USER_NOTIFICATION_CHANNELS)[number],
    );
  });
const eventTypeSchema = z.string().refine((value) => {
  return USER_NOTIFICATION_EVENT_TYPES.includes(
    value as (typeof USER_NOTIFICATION_EVENT_TYPES)[number],
  );
});

const updatePreferencesSchema = z.object({
  channels: z
    .object({
      inApp: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
      push: z.boolean(),
    })
    .optional(),
  eventPreferences: z
    .record(
      eventTypeSchema,
      z.object({
        enabled: z.boolean(),
        channels: z.array(channelSchema),
        frequency: z.enum(['instant', 'hourly', 'daily', 'weekly']),
      }),
    )
    .optional(),
  digest: z
    .object({
      enabled: z.boolean(),
      frequencies: z.array(z.enum(['daily', 'weekly'])),
      dailySendTime: z.string(),
      weeklySendDay: z.number().int().min(0).max(6),
      weeklySendTime: z.string(),
    })
    .optional(),
  quietHours: z
    .object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
    })
    .optional(),
  unsubscribedEventTypes: z.array(eventTypeSchema).optional(),
});

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const preferences = await NotificationPreferenceService.getPreferences(
      me.uid,
      normalizeTenantId(me.tenantId),
    );
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Failed to fetch user notification preferences', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = updatePreferencesSchema.parse(await request.json());

    const preferences = await NotificationPreferenceService.updatePreferences({
      userId: me.uid,
      tenantId: normalizeTenantId(me.tenantId),
      updates: payload as Partial<UserNotificationPreferences>,
    });

    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error('Failed to update user notification preferences', error);
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 },
    );
  }
}
