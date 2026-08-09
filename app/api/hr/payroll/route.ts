export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireHrAccess } from '../_utils';
import dayjs from 'dayjs';

// T-1: this route returns every employee's name, email, hourly rate and computed salary. It was
// reachable by ANY authenticated user of the tenant (including the `client` role) because it only
// called getCurrentUser(). requireHrAccess() restores the hr/admin/super_admin + plan gate its
// sibling routes already use. The caps are cost ceilings for a deferred feature.
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

    // Get employees for THIS tenant only (tenant isolation)
    const empSnap = await adminDb
      .collection('employees')
      .where('tenantId', '==', hrAuth.user.tenantId)
      .limit(MAX_EMPLOYEES)
      .get();
    const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Get logs for whole month
    const logsSnap = await adminDb
      .collection('attendance')
      .where('tenantId', '==', hrAuth.user.tenantId)
      .where('date', '>=', start.format('YYYY-MM-DD'))
      .where('date', '<=', end.format('YYYY-MM-DD'))
      .limit(MAX_ATTENDANCE_EVENTS)
      .get();

    const logs = logsSnap.docs.map((d) => d.data());

    const rows = employees.map((emp: any) => {
      const hourlyRate = emp.hourlyRate || 5; // DEFAULT HOURLY RATE

      const empLogs = logs.filter((l) => l.userId === emp.id);

      let totalMs = 0;

      // compute hours like in attendance detail
      for (let i = 0; i < empLogs.length; i++) {
        if (empLogs[i].type === 'login') {
          const logoutEvent = empLogs.find(
            (l: any) =>
              l.type === 'logout' && new Date(l.timestamp) > new Date(empLogs[i].timestamp),
          );

          if (logoutEvent) {
            totalMs +=
              new Date(logoutEvent.timestamp).getTime() - new Date(empLogs[i].timestamp).getTime();
          }
        }
      }

      const hours = totalMs / (1000 * 60 * 60);
      const salary = +(hours * hourlyRate).toFixed(2);

      return {
        id: emp.id,
        name: emp.name,
        email: emp.email || '',
        role: emp.role || '',
        hourlyRate,
        hours: +hours.toFixed(1),
        salary,
      };
    });

    return NextResponse.json({
      success: true,
      rows,
    });
  } catch (err: any) {
    console.error('Payroll API error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
