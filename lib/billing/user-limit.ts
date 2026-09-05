import { adminDb } from '@/lib/firebaseAdmin';
import { normalizePlan, resolvePlanTier, type PlanTier } from '@/lib/tenant/plan-access';
import { plans, normalizePlanKey } from '@/lib/billing/plans';
import { isUserAccessDisabled } from '@/lib/auth/user-access-state';

/**
 * Plan user-limit enforcement (audit P1).
 *
 * Locked decision: Starter 10 users, Pro 20 users, Enterprise unlimited. The
 * limit counts billable seats — active, non-client users in the tenant. The
 * `client` role is a limited external portal role (the tenant's own customers),
 * not a staff seat, so it never counts against the plan limit. Disabled users
 * do not count either.
 *
 * Limits are read from the canonical plan definitions in lib/billing/plans.ts
 * (limits.users; -1 means unlimited), so there is a single source of truth.
 *
 * This module owns the ACCOUNTING RULES (what counts as a seat) and the
 * point-in-time read. It deliberately does NOT own concurrency: a read here
 * followed by a write in the caller is a check-then-act race. Every path that
 * actually CONSUMES a seat must go through lib/billing/seat-reservation.ts,
 * which applies these same rules inside a serialized Firestore transaction.
 */

export const PLAN_LIMIT_EXCEEDED = 'plan_limit_exceeded';

export interface UserLimitCheck {
  ok: boolean;
  limit: number;
  used: number;
  plan: PlanTier;
}

/** Minimal shape of a Firestore query snapshot, so the same counting rules can be
 *  applied to a normal read and to a read performed inside a transaction. */
export interface SeatDocSnapshots {
  docs: Array<{ data: () => any }>;
}

export function getSeatLimitForPlan(plan: PlanTier): number {
  // trial mirrors starter seats; paid tiers come straight from plans.ts.
  const key = normalizePlanKey(plan);
  const limit = plans[key]?.limits?.users;
  return typeof limit === 'number' ? limit : 10;
}

/**
 * The Firestore sources a staff-seat decision is made from. Returned as refs/queries
 * rather than results so the seat-reservation transaction can read exactly the same
 * data inside `runTransaction` — one definition of "what counts", two read modes.
 */
export function staffSeatSources(tenantId: string) {
  return {
    tenantRef: adminDb.collection('tenants').doc(tenantId),
    usersQuery: adminDb.collection('users').where('tenantId', '==', tenantId),
    invitationsQuery: adminDb
      .collection('user_invitations')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'pending'),
  };
}

/**
 * Seats already consumed by the tenant: active, non-client users PLUS outstanding
 * (pending, unexpired) staff invitations.
 *
 * S9: pending invitations previously consumed no seat. A Starter tenant sitting at
 * 9 of 10 seats could therefore issue an unlimited number of invitations — every one
 * of them passed the check, because each was measured against a count that ignored the
 * invitations already in flight — and end up far over its plan once they were
 * accepted. An invitation is a reserved seat and must be counted as one.
 *
 * Accepting an invitation flips its status to 'accepted' in the same batch that
 * creates the user document, so a seat is never counted twice. Expired invitations
 * hold no seat.
 *
 * Client-portal invitations are the tenant's own customers, not staff seats, so they
 * are excluded exactly as client users are.
 */
export function countBillableSeats(
  usersSnap: SeatDocSnapshots,
  invitesSnap: SeatDocSnapshots,
  now: number = Date.now(),
): number {
  let count = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    const role = String(data.role || '').toLowerCase();
    if (role === 'client') continue;
    if (isUserAccessDisabled(data)) continue;
    count += 1;
  }

  for (const doc of invitesSnap.docs) {
    const data = doc.data() || {};
    const role = String(data.role || '').toLowerCase();
    if (role === 'client') continue;

    const expiresAt = data.expiresAt;
    const expiresMs =
      typeof expiresAt?.toDate === 'function' ? expiresAt.toDate().getTime() : Number.NaN;
    if (Number.isFinite(expiresMs) && expiresMs < now) continue;

    count += 1;
  }

  return count;
}

/**
 * Committed staff-seat usage for a tenant. "Committed" means written state — active
 * staff users and pending invitations. In-flight seat reservations held by concurrent
 * provisioning requests are deliberately NOT included here, because this number is
 * reported to operators ("you currently use N seats") and a transient reservation is
 * not a seat anyone holds. The reservation transaction adds them on top.
 */
export async function getBillableSeatUsage(tenantId: string): Promise<number> {
  const { usersQuery, invitationsQuery } = staffSeatSources(tenantId);
  const [usersSnap, invitesSnap] = await Promise.all([usersQuery.get(), invitationsQuery.get()]);
  return countBillableSeats(usersSnap, invitesSnap);
}

/**
 * A scheduled downgrade takes effect at period end, but once it is scheduled the
 * workspace must not be allowed to grow past the future tier's capacity. Otherwise a
 * Pro tenant could schedule Starter at 8 seats, add another 12 users before period end,
 * and arrive on Starter with 20 billable users. Existing access is not removed early;
 * this only caps NEW reservations at the stricter of the current and pending plans.
 */
export function resolveSeatEnforcementPlan(data: Record<string, unknown>): PlanTier {
  const currentPlan = normalizePlan(data.plan);
  const pendingPlan = resolvePlanTier(data.pendingDowngradePlan);
  if (!pendingPlan || pendingPlan === 'trial') return currentPlan;

  const currentLimit = getSeatLimitForPlan(currentPlan);
  const pendingLimit = getSeatLimitForPlan(pendingPlan);

  if (currentLimit < 0) return pendingPlan;
  if (pendingLimit < 0) return currentPlan;
  return pendingLimit < currentLimit ? pendingPlan : currentPlan;
}

export async function checkUserLimitForPlan(
  tenantId: string,
  targetRole: string,
  plan: PlanTier,
): Promise<UserLimitCheck> {
  const role = String(targetRole || '').toLowerCase();
  const limit = getSeatLimitForPlan(plan);

  // Client portal users and unlimited plans are never seat-limited.
  if (role === 'client' || limit < 0) {
    return { ok: true, limit, used: 0, plan };
  }

  const used = await getBillableSeatUsage(tenantId);
  return { ok: used < limit, limit, used, plan };
}

/**
 * Point-in-time read of whether the tenant could add one more billable seat of
 * `targetRole`. Client seats are always allowed (they are not staff seats). Unlimited
 * plans (limit < 0) always pass. Reads the tenant's current plan and any scheduled
 * downgrade from Firestore, enforcing whichever has the stricter seat ceiling.
 *
 * Read-only callers (advisory UI state, "is the tenant over its limit" questions) may
 * use this directly. A caller that goes on to CREATE or RE-ENABLE a staff identity
 * must use reserveStaffSeat() instead — this function cannot see a seat another
 * request is in the middle of taking.
 */
export async function checkUserLimit(
  tenantId: string,
  targetRole: string,
): Promise<UserLimitCheck> {
  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  const plan = resolveSeatEnforcementPlan((tenantSnap.data() || {}) as Record<string, unknown>);
  return checkUserLimitForPlan(tenantId, targetRole, plan);
}

/**
 * Standard 402/403-style response body for an exceeded limit. Callers return
 * this with HTTP 403 and clear upgrade guidance.
 */
export function planLimitResponseBody(check: UserLimitCheck) {
  return {
    error: PLAN_LIMIT_EXCEEDED,
    message: `Your ${check.plan} plan allows up to ${check.limit} team members and you currently have ${check.used}. Upgrade your plan to add more team members.`,
    limit: check.limit,
    used: check.used,
    plan: check.plan,
  };
}
