import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { requireModule, isPlanAccessError } from '@/app/lib/plan-enforcement';
import { TimeTrackingService } from '@/lib/hr/time-tracking';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  breakMinutes: z.number().int().min(0).max(480).optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await requireModule(me.tenantId, 'hr', { role: me.role });
    } catch (err) {
      if (isPlanAccessError(err)) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      return NextResponse.json(
        { ok: false, error: 'Unable to validate module access' },
        { status: 500 },
      );
    }

    const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }

    const { id } = await params;
    const entry = await TimeTrackingService.clockOut(
      id,
      me.tenantId,
      me.uid,
      parsed.data.breakMinutes || 0,
    );

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    console.error('HR clock-out error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to clock out' },
      { status: 400 },
    );
  }
}
