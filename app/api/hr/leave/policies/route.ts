import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { isPlanAccessError, requireModule } from '@/app/lib/plan-enforcement';
import { LeaveService } from '@/lib/hr/leave';

export const runtime = 'nodejs';

const schema = z.object({
  leaveType: z.enum(['vacation', 'sick', 'personal', 'unpaid', 'bereavement']),
  name: z.string().min(2),
  accrualSchedule: z.enum(['monthly', 'yearly']),
  accrualRateHours: z.number().min(0),
  annualAllocationHours: z.number().min(0),
  maxCarryOverHours: z.number().min(0),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
});

function canManagePolicies(role?: string) {
  const normalized = (role || '').toLowerCase().replace(/-/g, '_');
  return normalized === 'hr' || normalized === 'admin' || normalized === 'super_admin';
}

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManagePolicies(me.role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
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

    const payload = schema.parse(await request.json());
    const policy = await LeaveService.upsertPolicy({
      tenantId: me.tenantId,
      leaveType: payload.leaveType,
      name: payload.name,
      accrualSchedule: payload.accrualSchedule,
      accrualRateHours: payload.accrualRateHours,
      annualAllocationHours: payload.annualAllocationHours,
      maxCarryOverHours: payload.maxCarryOverHours,
      blackoutDates: payload.blackoutDates,
    });

    return NextResponse.json({ ok: true, policy });
  } catch (err) {
    console.error('HR leave policy upsert error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to upsert leave policy' },
      { status: 400 },
    );
  }
}
