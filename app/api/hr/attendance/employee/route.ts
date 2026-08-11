export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireHrAccess } from '../../_utils';
import { fetchUserAttendanceRange, monthRange, summarizeMonth } from '@/lib/attendance/query';

/**
 * One person's attendance for a month.
 *
 * S12: the subject is read from `users` by uid. It was previously read from `employees`
 * by document id — an auto-id no auth session has ever carried — so this route answered
 * "Employee not found" for every real person in the workspace.
 */
export async function GET(request: Request) {
  const hrAuth = await requireHrAccess();
  if (!hrAuth.ok)
    return NextResponse.json({ success: false, message: hrAuth.error }, { status: hrAuth.status });

  try {
    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get('userId') || '').trim();
    const month = searchParams.get('month');
    const range = monthRange(month);
    const tenantId = hrAuth.user.tenantId;

    if (!userId || !range) {
      return NextResponse.json(
        { success: false, message: 'A userId and a month in YYYY-MM format are required.' },
        { status: 400 },
      );
    }

    const userSnap = await adminDb.collection('users').doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() || {} : null;

    // A cross-tenant subject is reported as missing rather than forbidden, so uids from
    // another workspace cannot be probed through the status code.
    if (!userData || String(userData.tenantId || '') !== String(tenantId)) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const days = await fetchUserAttendanceRange({
      tenantId,
      userId,
      from: range.from,
      to: range.to,
    });

    return NextResponse.json({
      success: true,
      month,
      employee: {
        id: userSnap.id,
        name: String(userData.name || userData.displayName || userData.email || ''),
        email: String(userData.email || ''),
        role: String(userData.role || ''),
        department: String(userData.department || ''),
      },
      days,
      summary: summarizeMonth(days),
    });
  } catch (err: any) {
    console.error('Employee attendance API error:', err);
    return NextResponse.json(
      { success: false, message: 'Unable to load attendance.' },
      { status: 500 },
    );
  }
}
