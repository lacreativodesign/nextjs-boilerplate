import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Attendance readers (S12).
 *
 * S11 rebuilt the writer as ONE DOCUMENT PER USER PER DAY, keyed
 * `${tenantId}__${userId}__${date}` and carrying firstLoginAt / lastLogoutAt /
 * loginCount. The readers were still written for the shape that came before it — a stream
 * of `{ type: 'login' | 'logout' }` events — and joined the roster against the
 * `employees` collection S10 retired. Both screens would therefore have kept rendering
 * empty even though real attendance is now being recorded.
 *
 * The join, the caps and the per-day arithmetic live here, once. The five original
 * readers were the argument for that: three joined `employees`, two joined `users`, and
 * one queried an `attendance/{userId}/logs` subcollection no writer has ever created.
 *
 * HOURS. With one document per day, hours is the span from the first sign-in to the last
 * sign-out — arrival to departure — not the sum of individual sessions. That is a real
 * change from what the old page tried to compute, and it is the honest reading of what
 * the writer keeps: someone who signs in four times has one arrival and one departure,
 * and the gaps between are not observable from a login record.
 */

/** Roster cap. A tenant is 10–200 people; 500 is headroom, not a target. */
export const MAX_ROSTER = 500;

/** Day-document cap. 500 people × 31 days is 15,500, so a month is never truncated. */
export const MAX_ATTENDANCE_DAYS = 20000;

export type AttendanceDaySummary = {
  date: string;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  loginCount: number;
  /** Arrival-to-departure hours, or null when the day has no completed span. */
  hours: number | null;
};

export type RosterMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

/** userId -> date -> summary */
export type AttendanceByUser = Record<string, Record<string, AttendanceDaySummary>>;

/**
 * Inclusive YYYY-MM-DD bounds for a YYYY-MM month, or null if the month is malformed.
 *
 * Computed with UTC date arithmetic rather than string concatenation so month lengths and
 * leap years are right, and returned as strings because `date` is stored and filtered as
 * a lexicographically sortable string.
 */
export function monthRange(month: unknown): { from: string; to: string } | null {
  const value = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(value)) return null;

  const [year, monthNumber] = value.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;

  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${value}-01`,
    to: `${value}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Turns one stored day document into the shape both screens render. */
export function summarizeAttendanceDay(data: Record<string, unknown>): AttendanceDaySummary {
  const firstLoginAt = typeof data.firstLoginAt === 'string' ? data.firstLoginAt : null;
  const lastLogoutAt = typeof data.lastLogoutAt === 'string' ? data.lastLogoutAt : null;

  let hours: number | null = null;
  if (firstLoginAt && lastLogoutAt) {
    const spanMs = new Date(lastLogoutAt).getTime() - new Date(firstLoginAt).getTime();
    // A negative or non-finite span means clock skew or a malformed timestamp. Reporting
    // nothing beats reporting a negative day.
    if (Number.isFinite(spanMs) && spanMs > 0) {
      hours = Math.round((spanMs / 3_600_000) * 100) / 100;
    }
  }

  return {
    date: String(data.date || ''),
    firstLoginAt,
    lastLogoutAt,
    loginCount: Number(data.loginCount || 0),
    hours,
  };
}

/**
 * The tenant's staff roster, from `users` — the identity model settled in S10 and the
 * same uid the writer keys events on, so the join always matches.
 *
 * The external `client` role is excluded: a client portal identity is not a member of
 * staff and must never appear on an attendance sheet.
 */
export async function fetchRoster(tenantId: string): Promise<RosterMember[]> {
  const snap = await adminDb
    .collection('users')
    .where('tenantId', '==', tenantId)
    .limit(MAX_ROSTER)
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: String(data.name || data.displayName || data.email || ''),
        email: String(data.email || ''),
        role: String(data.role || ''),
        department: String(data.department || ''),
      };
    })
    .filter((member) => member.role !== 'client')
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every attendance day document for a tenant in an inclusive date range, grouped by user.
 * Served by the composite index on (tenantId ASC, date ASC).
 */
export async function fetchAttendanceRange(input: {
  tenantId: string;
  from: string;
  to: string;
}): Promise<AttendanceByUser> {
  const snap = await adminDb
    .collection('attendance')
    .where('tenantId', '==', input.tenantId)
    .where('date', '>=', input.from)
    .where('date', '<=', input.to)
    .limit(MAX_ATTENDANCE_DAYS)
    .get();

  const byUser: AttendanceByUser = {};
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const userId = String(data.userId || '');
    // A document with no userId cannot be attributed to anyone. Bucketing it under an
    // empty key would attach it to every roster member with a falsy id.
    if (!userId) continue;

    const summary = summarizeAttendanceDay(data);
    if (!summary.date) continue;

    byUser[userId] = byUser[userId] || {};
    byUser[userId][summary.date] = summary;
  }
  return byUser;
}

/**
 * One user's days in a range, served by the composite index on
 * (tenantId ASC, userId ASC, date ASC).
 */
export async function fetchUserAttendanceRange(input: {
  tenantId: string;
  userId: string;
  from: string;
  to: string;
}): Promise<Record<string, AttendanceDaySummary>> {
  const snap = await adminDb
    .collection('attendance')
    .where('tenantId', '==', input.tenantId)
    .where('userId', '==', input.userId)
    .where('date', '>=', input.from)
    .where('date', '<=', input.to)
    .limit(MAX_ATTENDANCE_DAYS)
    .get();

  const byDate: Record<string, AttendanceDaySummary> = {};
  for (const doc of snap.docs) {
    const summary = summarizeAttendanceDay(doc.data() || {});
    if (summary.date) byDate[summary.date] = summary;
  }
  return byDate;
}

/** Days present and total hours across a set of day summaries. */
export function summarizeMonth(days: Record<string, AttendanceDaySummary>): {
  daysPresent: number;
  totalHours: number;
} {
  const entries = Object.values(days);
  const totalHours = entries.reduce((sum, day) => sum + (day.hours || 0), 0);
  return {
    // Present means a sign-in was recorded, whether or not a sign-out closed the day.
    daysPresent: entries.filter((day) => Boolean(day.firstLoginAt)).length,
    totalHours: Math.round(totalHours * 100) / 100,
  };
}
