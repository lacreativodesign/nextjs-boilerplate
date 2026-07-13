import { adminDb } from '@/lib/firebaseAdmin';
import { normalizePlan, type PlanTier } from '@/lib/tenant/plan-access';
import { plans, normalizePlanKey } from '@/lib/billing/plans';

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
 */

export const PLAN_LIMIT_EXCEEDED = 'plan_limit_exceeded';

export interface UserLimitCheck {
  ok: boolean;
  limit: number;
  used: number;
  plan: PlanTier;
}

function seatLimitForPlan(plan: PlanTier): number {
  // trial mirrors starter seats; paid tiers come straight from plans.ts.
  const key = normalizePlanKey(plan);
  const limit = plans[key]?.limits?.users;
  return typeof limit === 'number' ? limit : 10;
}

/**
 * Counts seats already consumed by the tenant: active, non-client users PLUS
 * outstanding (pending, unexpired) staff invitations.
 *
 * S9: pending invitations previously consumed no seat. A Starter tenant sitting at
 * 9 of 10 seats could therefore issue an unlimited number of invitations — every one
 * of them passed the check, because each was measured against a count that ignored
 * the invitations already in flight — and end up far over its plan once they were
 * accepted. An invitation is a reserved seat and must be counted as one.
 *
 * Accepting an invitation flips its status to 'accepted' in the same batch that
 * creates the user document, so a seat is never counted twice. Expired invitations
 * hold no seat.
 *
 * Client-portal invitations are the tenant's own customers, not staff seats, so they
 * are excluded exactly as client users are.
 */
async function countBillableSeats(tenantId: string): Promise<number> {
  const [usersSnap, invitesSnap] = await Promise.all([
    adminDb.collection('users').where('tenantId', '==', tenantId).get(),
    adminDb
      .collection('user_invitations')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'pending')
      .get(),
  ]);

  let count = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    const role = String(data.role || '').toLowerCase();
    const status = String(data.status || 'active').toLowerCase();
    if (role === 'client') continue;
    if (status === 'disabled' || status === 'deleted') continue;
    count += 1;
  }

  const now = Date.now();
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
 * Checks whether the tenant can add one more billable seat of `targetRole`.
 * Client seats are always allowed (they are not staff seats). Unlimited plans
 * (limit < 0) always pass. Reads the tenant's plan from its Firestore doc.
 */
export async function checkUserLimit(
  tenantId: string,
  targetRole: string,
): Promise<UserLimitCheck> {
  const role = String(targetRole || '').toLowerCase();

  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  const plan = normalizePlan(tenantSnap.data()?.plan);
  const limit = seatLimitForPlan(plan);

  // Client portal users and unlimited plans are never seat-limited.
  if (role === 'client' || limit < 0) {
    return { ok: true, limit, used: 0, plan };
  }

  const used = await countBillableSeats(tenantId);
  return { ok: used < limit, limit, used, plan };
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
