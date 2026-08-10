import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Attendance writer (S11).
 *
 * Attendance never worked, and S6 deleted the only thing that wrote it. This is the
 * rebuild, on the identity model settled in S10: a person is a `users` document keyed by
 * the Firebase Auth uid, so an attendance record is keyed by that uid too. The deleted
 * writer keyed events on an `employees` auto-id that no session has ever carried, which
 * is exactly why the join could never match and every screen showed an empty grid.
 *
 * ONE DOCUMENT PER USER PER DAY, at a deterministic id. Two things follow:
 *
 *   - It is idempotent. The old design appended every login to an unbounded `logs` array
 *     on a single document, which breaches Firestore's 1 MB ceiling at roughly ten
 *     thousand appends and then hard-fails that user's writes permanently. Here someone
 *     who signs in forty times in a day still owns exactly one small document.
 *   - It answers the screens directly. A monthly sheet asks "was this person here, and
 *     when did they arrive and leave" — that is firstLoginAt and lastLogoutAt. Absence
 *     becomes the absence of a document rather than a scan of an event stream.
 *
 * TIMEZONE. `date` is the calendar day in the timezone passed by the caller, and UTC when
 * none is. No tenant currently stores a timezone, so every caller gets UTC today; the
 * parameter exists so the reader rebuild can supply a tenant zone later without
 * re-bucketing history, because the stored timestamps stay authoritative no matter how
 * the day is bucketed.
 */

export type AttendanceEventType = 'login' | 'logout';

export type AttendanceWriteResult =
  | { ok: true; docId: string; date: string }
  | { ok: false; reason: 'missing-identity' | 'write-failed' };

/**
 * The calendar day an instant falls on, as YYYY-MM-DD.
 *
 * `en-CA` formats as YYYY-MM-DD natively, which keeps the value lexicographically
 * sortable — the readers filter with `date >=` and `date <=` string comparisons and would
 * silently return wrong ranges under any other format.
 */
export function attendanceDayKey(at: Date, timeZone?: string | null): string {
  const zone = String(timeZone || '').trim();
  if (!zone) return at.toISOString().slice(0, 10);

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // An unrecognised IANA zone must not lose the event: fall back to UTC.
    return at.toISOString().slice(0, 10);
  }
}

/**
 * Deterministic document id.
 *
 * Double underscores separate the parts so an id cannot collide across tenants, and the
 * id contains no '/', which Firestore would read as a path separator.
 */
export function attendanceDocId(tenantId: string, userId: string, date: string): string {
  return `${tenantId}__${userId}__${date}`;
}

/**
 * Records one attendance event.
 *
 * Never throws. Attendance is observational: failing to record that someone signed in
 * must never stop them signing in, so callers get a result object and the login and
 * logout paths carry on regardless. This is the deliberate opposite of the session ledger
 * write in /api/session-login, which is fail-closed because an untracked session cannot
 * be revoked.
 */
export async function recordAttendanceEvent(input: {
  tenantId: string | null | undefined;
  userId: string | null | undefined;
  type: AttendanceEventType;
  at?: Date;
  timeZone?: string | null;
}): Promise<AttendanceWriteResult> {
  const tenantId = String(input.tenantId || '').trim();
  const userId = String(input.userId || '').trim();

  // Someone with no tenant claim has no workspace to be present in. Recording against an
  // empty tenantId would drop the event into a bucket every tenant-scoped read matches.
  if (!tenantId || !userId) return { ok: false, reason: 'missing-identity' };

  const at = input.at ?? new Date();
  const date = attendanceDayKey(at, input.timeZone);
  const timestamp = at.toISOString();
  const docId = attendanceDocId(tenantId, userId, date);

  try {
    const ref = adminDb.collection('attendance').doc(docId);

    // A transaction rather than a merge because firstLoginAt must be written once and
    // never overwritten: two sign-ins racing on the same day must not let the later one
    // claim to be the arrival time.
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? snap.data() || {} : {};

      const next: Record<string, unknown> = {
        tenantId,
        userId,
        date,
        updatedAt: timestamp,
      };

      if (input.type === 'login') {
        next.firstLoginAt = existing.firstLoginAt || timestamp;
        next.lastLoginAt = timestamp;
        next.loginCount = Number(existing.loginCount || 0) + 1;
      } else {
        next.lastLogoutAt = timestamp;
      }

      if (!snap.exists) next.createdAt = timestamp;

      tx.set(ref, next, { merge: true });
    });

    return { ok: true, docId, date };
  } catch (err) {
    // Logged without the uid or the tenant id: this runs on the login path, and route
    // logs must not carry identifiers.
    console.error('[ATTENDANCE] failed to record event', err);
    return { ok: false, reason: 'write-failed' };
  }
}
