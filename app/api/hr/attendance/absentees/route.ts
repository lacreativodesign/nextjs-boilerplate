export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireHrAccess } from '../../_utils';
import { fetchAttendanceRange, fetchRoster, MAX_ROSTER } from '@/lib/attendance/query';

/**
 * Who has not signed in on a given day.
 *
 * S12: absence is the ABSENCE of a day document, which is a single equality query on one
 * date. The previous version scanned the whole collection with no date filter, keyed the
 * result by document id — which is `${tenantId}__${userId}__${date}`, not a uid — and
 * then looked for a `logs` array the writer does not produce, so it would have reported
 * every member of staff absent every day.
 *
 * There is deliberately no "last seen" column: it needs either a query per person or an
 * unbounded history scan, and belongs with a screen that actually displays it.
 */
export async function GET(request: Request) {
  const access = await requireHrAccess();
  if (!access.ok)
    return NextResponse.json({ success: false, error: access.error }, { status: access.status });

  try {
    const { searchParams } = new URL(request.url);
    const requested = String(searchParams.get('date') || '').trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : new Date().toISOString().slice(0, 10);

    const tenantId = access.user.tenantId;
    const [roster, byUser] = await Promise.all([
      fetchRoster(tenantId),
      fetchAttendanceRange({ tenantId, from: date, to: date }),
    ]);

    const absentees = roster
      .filter((member) => !byUser[member.id]?.[date]?.firstLoginAt)
      .map((member) => ({
        userId: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
      }));

    return NextResponse.json({
      success: true,
      date,
      present: roster.length - absentees.length,
      absentees,
      // Surfaced so a caller can tell a genuinely small roster from a truncated one.
      rosterTruncated: roster.length >= MAX_ROSTER,
    });
  } catch (e) {
    console.error('Absentees error:', e);
    return NextResponse.json(
      { success: false, error: 'Failed to load absentees.' },
      { status: 500 },
    );
  }
}
