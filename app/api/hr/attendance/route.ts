export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireHrAccess } from '../_utils';
import { fetchAttendanceRange, fetchRoster, monthRange } from '@/lib/attendance/query';

/**
 * Monthly attendance grid.
 *
 * S12: the roster comes from `users`, not the `employees` collection S10 retired, so the
 * uid the S11 writer stamps is the same id the grid renders rows for — the join that
 * could never match now always does. The per-day arithmetic is done server-side in
 * lib/attendance/query so the grid, the per-employee view and the absentee list cannot
 * compute "hours" three different ways.
 */
export async function GET(request: Request) {
  try {
    const hrAuth = await requireHrAccess();
    if (!hrAuth.ok)
      return NextResponse.json(
        { success: false, message: hrAuth.error },
        { status: hrAuth.status },
      );

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const range = monthRange(month);

    if (!range) {
      return NextResponse.json(
        { success: false, message: 'A month in YYYY-MM format is required.' },
        { status: 400 },
      );
    }

    const tenantId = hrAuth.user.tenantId;
    const [employees, days] = await Promise.all([
      fetchRoster(tenantId),
      fetchAttendanceRange({ tenantId, from: range.from, to: range.to }),
    ]);

    return NextResponse.json({ success: true, month, employees, days });
  } catch (err: any) {
    console.error('Attendance load error:', err);
    return NextResponse.json(
      { success: false, message: 'Unable to load attendance.' },
      { status: 500 },
    );
  }
}
