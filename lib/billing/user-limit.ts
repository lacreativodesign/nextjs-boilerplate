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
 */

export const PLAN_LIMIT_EXCEEDED = 'plan_limit_exceeded';

export interface UserLimitCheck {
  ok: boolean;
  limit: number;
  used: number;
  plan: PlanTier;
}

export function getSeatLimitForPlan(plan: PlanTier): number {
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
export async function getBillableSeatUsage(tenantId: string): Promise<number> {
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
    if (role === 'client') continue;
    if (isUserAccessDisabled(data)) continue;
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
 * A scheduled downgrade takes effect at period end, but once it is scheduled the
 * workspace must not be allowed to grow past the future tier's capacity. Otherwise a
 * Pro tenant could schedule Starter at 8 seats, add another 12 users before period end,
 * and arrive on Starter with 20 billable users. Existing access is not removed early;
 * this only caps NEW reservations at the stricter of the current and pending plans.
 */
function resolveSeatEnforcementPlan(data: Record<string, unknown>): PlanTier {
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
 * Checks whether the tenant can add one more billable seat of `targetRole`.
 * Client seats are always allowed (they are not staff seats). Unlimited plans
 * (limit < 0) always pass. Reads the tenant's current plan and any scheduled
 * downgrade from Firestore, enforcing whichever has the stricter seat ceiling.
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
