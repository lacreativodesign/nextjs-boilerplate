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
 * Counts active, non-client users already in the tenant. Roles are read from
 * the users collection and lower-cased; `client` and disabled users are
 * excluded. Returns a live count via an aggregation-free scan bounded by the
 * tenant's own user set (tenants are small: 10–200 users by product design).
 */
async function countBillableSeats(tenantId: string): Promise<number> {
  const snap = await adminDb.collection('users').where('tenantId', '==', tenantId).get();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const role = String(data.role || '').toLowerCase();
    const status = String(data.status || 'active').toLowerCase();
    if (role === 'client') continue;
    if (status === 'disabled' || status === 'deleted') continue;
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
