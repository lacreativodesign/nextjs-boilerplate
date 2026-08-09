import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireHrAccess } from '../../_utils';

// T-1: attendance is a DEFERRED feature; this reader has no UI consumer and the collection has
// never held a document. The caps are cost ceilings — the `attendance` query has no date filter,
// so without a limit a future writer would make this a full tenant-lifetime scan on every call.
const MAX_USERS = 500;
const MAX_ATTENDANCE_EVENTS = 5000;

export async function GET() {
  const access = await requireHrAccess();
  if (!access.ok)
    return NextResponse.json({ success: false, error: access.error }, { status: access.status });

  try {
    const usersSnap = await adminDb
      .collection('users')
      .where('tenantId', '==', access.user.tenantId)
      .limit(MAX_USERS)
      .get();
    const attendanceSnap = await adminDb
      .collection('attendance')
      .where('tenantId', '==', access.user.tenantId)
      .limit(MAX_ATTENDANCE_EVENTS)
      .get();

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Convert attendance data into quick lookup map
    const attendanceMap: Record<string, any[]> = {};
    attendanceSnap.forEach((doc) => {
      attendanceMap[doc.id] = doc.data().logs || [];
    });

    let absentees: any[] = [];

    usersSnap.forEach((userDoc) => {
      const user = userDoc.data();
      const logs = attendanceMap[userDoc.id] || [];

      const loggedToday = logs.some((log) => new Date(log.timestamp) >= todayStart);

      if (!loggedToday) {
        const lastLog = logs.length ? logs[0].timestamp : null;

        absentees.push({
          userId: userDoc.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLogin: lastLog,
        });
      }
    });

    return NextResponse.json({
      success: true,
      absentees,
    });
  } catch (e) {
    console.error('Absentees error:', e);
    return NextResponse.json(
      { success: false, error: 'Failed to load absentees.' },
      { status: 500 },
    );
  }
}
