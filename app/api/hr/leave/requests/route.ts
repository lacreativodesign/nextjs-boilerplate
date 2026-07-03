import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { isPlanAccessError, requireModule } from '@/app/lib/plan-enforcement';
import { LeaveService } from '@/lib/hr/leave';

export const runtime = 'nodejs';

const querySchema = z.object({
  employeeId: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
});

export async function GET(request: NextRequest) {
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

    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const requests = await LeaveService.listRequests({
      tenantId: me.tenantId,
      requesterUserId: me.uid,
      requesterRole: me.role,
      employeeId: query.employeeId,
      status: query.status,
    });

    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    console.error('HR leave requests list error', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch leave requests' },
      { status: 400 },
    );
  }
}
