import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { USER_NOTIFICATION_EVENT_TYPES } from '@/lib/notifications/preferences-config';
import { NotificationPreferenceService } from '@/lib/notifications/preferences';
import { parseNotificationUnsubscribeToken } from '@/lib/notifications/unsubscribe-token';
import { normalizeTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    eventType: z
      .string()
      .refine((value) =>
        USER_NOTIFICATION_EVENT_TYPES.includes(
          value as (typeof USER_NOTIFICATION_EVENT_TYPES)[number],
        ),
      )
      .optional(),
    token: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.eventType || value.token), {
    message: 'eventType or token is required',
  });

export async function POST(request: NextRequest) {
  try {
    const payload = bodySchema.parse(await request.json());

    let userId = '';
    let tenantId = '';
    let eventType = payload.eventType;

    if (payload.token) {
      // PR5: public unsubscribe links are authenticated by an HMAC signature. The old
      // token was plain base64url text and could be forged for another tenant/user/event.
      const parsed = parseNotificationUnsubscribeToken(payload.token);
      if (!parsed) {
        return NextResponse.json({ error: 'Invalid unsubscribe token' }, { status: 400 });
      }
      userId = parsed.userId;
      tenantId = parsed.tenantId;
      eventType = parsed.eventType;
    } else {
      const me = await getCurrentUser();
      if (!me) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = me.uid;
      tenantId = normalizeTenantId(me.tenantId);
    }

    if (!eventType) {
      return NextResponse.json({ error: 'Event type is required' }, { status: 400 });
    }

    await NotificationPreferenceService.unsubscribe({
      userId,
      tenantId,
      eventType: eventType as (typeof USER_NOTIFICATION_EVENT_TYPES)[number],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to unsubscribe from notifications', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
