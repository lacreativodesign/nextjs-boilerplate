import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { cancelCalendlyMeeting } from '@/lib/integrations/calendly';

const cancelSchema = z.object({
  meetingId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId)
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid cancel payload.', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await cancelCalendlyMeeting({
      tenantId: me.tenantId,
      meetingId: parsed.data.meetingId,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('POST /api/integrations/calendly/cancel', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to cancel Calendly meeting.' },
      { status: 400 },
    );
  }
}
