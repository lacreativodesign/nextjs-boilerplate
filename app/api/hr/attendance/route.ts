export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireHrAccess } from '../_utils';
import dayjs from 'dayjs';

// T-1: attendance is a DEFERRED feature. Its only writer was the unreferenced /api/login-stamp
// route (removed in this change), so the collection has never held a document and the
// employees-doc-id <-> auth-uid join can never match. These caps are cost ceilings so that a
// future writer cannot silently turn this reader into an unbounded tenant-wide scan.
const MAX_EMPLOYEES = 500;
const MAX_ATTENDANCE_EVENTS = 5000;

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

    if (!month) {
      return NextResponse.json({ success: false, message: 'Missing month' }, { status: 400 });
    }

    const start = dayjs(month + '-01').startOf('month');
    const end = start.endOf('month');

    const employeesSnap = await adminDb
      .collection('employees')
      .where('tenantId', '==', hrAuth.user.tenantId)
      .limit(MAX_EMPLOYEES)
      .get();
    const employees = employeesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const attendanceSnap = await adminDb
      .collection('attendance')
      .where('tenantId', '==', hrAuth.user.tenantId)
      .where('date', '>=', start.format('YYYY-MM-DD'))
      .where('date', '<=', end.format('YYYY-MM-DD'))
      .limit(MAX_ATTENDANCE_EVENTS)
      .get();

    const attendance = attendanceSnap.docs.map((d) => d.data());

    return NextResponse.json({
      success: true,
      employees,
      attendance,
    });
  } catch (err: any) {
    console.error('Attendance load error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
