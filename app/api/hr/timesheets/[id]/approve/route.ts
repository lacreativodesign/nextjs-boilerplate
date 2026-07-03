import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { requireModule, isPlanAccessError } from '@/app/lib/plan-enforcement';
import { TimeTrackingService } from '@/lib/hr/time-tracking';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

const bodySchema = z.object({
  approve: z.boolean(),
  rejectionReason: z.string().max(500).optional(),
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

    const payload = bodySchema.parse(await request.json());
    const { id } = await params;

    const timesheet = await TimeTrackingService.approveTimesheet({
      timesheetId: id,
      tenantId: me.tenantId,
      requesterUserId: me.uid,
      requesterRole: me.role,
      approve: payload.approve,
      rejectionReason: payload.rejectionReason,
    });

    const timesheetOwnerId = (timesheet as any)?.userId ? String((timesheet as any).userId) : '';
    if (timesheetOwnerId && timesheetOwnerId !== me.uid) {
      await createNotification({
        toUserId: timesheetOwnerId,
        tenantId: me.tenantId,
        type: payload.approve ? 'success' : 'info',
        title: payload.approve ? 'Timesheet approved' : 'Timesheet rejected',
        message: payload.approve ? 'Your timesheet was approved.' : 'Your timesheet was rejected.',
        entityType: 'hr',
        entityId: id,
        deepLink: '/hr',
      });
    }

    return NextResponse.json({ ok: true, timesheet });
  } catch (err) {
    console.error('HR approve timesheet error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to review timesheet' },
      { status: 400 },
    );
  }
}
