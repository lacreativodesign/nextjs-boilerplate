import { adminDb } from '@/lib/firebaseAdmin';
import { plans } from '@/lib/billing/plans';
import { resolvePlanModules, type PlanTier } from '@/lib/tenant/plan-access';
import { AuditLogger } from '@/lib/audit/audit-logger';

/**
 * Canonical billing state service (P0-3, locked founder decision).
 *
 * Every subscription lifecycle event — checkout link, subscription
 * created/updated/deleted, payment succeeded/failed — flows through this module
 * so plan, modules, limits, billingStatus, subscriptionState, lock state,
 * Stripe IDs, period end, cancelAtPeriodEnd and trial end are always derived in
 * ONE place, with an append-only audit record per transition in
 * `billing_state_audit`.
 *
 * Rules encoded here:
 * - Modules and limits are re-derived from the plan on every change.
 * - Unknown tiers fail closed: no plan/module/limit write is ever made for an
 *   unrecognized plan string; the audit record carries a warning instead.
 * - Failed payments: attempt 1–2 → grace, attempt 3+ → soft lock. The lock
 *   ladder dates (7-day grace, soft lock day 8, hard lock day 21, data
 *   retained 60 days) are stamped when the ladder starts and cleared on the
 *   next successful payment.
 * - subscription.deleted → hard lock, billing canceled.
 */

export type SubscriptionLifecycleSource =
  | 'checkout.linked'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.deleted'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'lock.advanced'
  | 'plan.downgrade_scheduled'
  | 'plan.downgrade_cleared'
  | 'trial.expired'
  | 'trial.grace_ended';

const KNOWN_PAID_TIERS = ['starter', 'pro', 'enterprise'] as const;
export type PaidTier = (typeof KNOWN_PAID_TIERS)[number];

// Fully locked-down entitlements for a canceled/hard-locked tenant. A canceled
// subscription must not retain the paid plan's module access: canAccessPlanModule
// reads modules[key] === true, so leaving the old paid module map in place would
// keep granting Finance/HR/etc. after cancellation. subscription.deleted clears
// modules to all-false and limits to the trial baseline so no stale paid
// entitlement survives, while invoice/finance history is retained separately.
const LOCKED_MODULES: Record<string, boolean> = {
  crm: false,
  sales: false,
  production: false,
  projects: false,
  approvals: false,
  notifications: false,
  finance: false,
  hr: false,
  reports: false,
  client_stripe_connect: false,
};

export function isKnownPaidTier(value: unknown): value is PaidTier {
  return KNOWN_PAID_TIERS.includes(String(value || '').trim() as PaidTier);
}

export function mapStripeStatusToSubscriptionState(status: string) {
  switch (status) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'grace';
    case 'unpaid':
      return 'soft_locked';
    case 'canceled':
      return 'hard_locked';
    case 'trialing':
      return 'trial';
    default:
      return 'grace';
  }
}

export function normalizeBillingStatus(status: string): 'active' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'canceled') return 'canceled';
  // past_due, unpaid, incomplete, incomplete_expired, paused -> restrict
  return 'past_due';
}

// Lock ladder (locked founder decision): 7-day grace with full access, soft
// lock (read-only) from day 8, hard lock from day 21, data retained 60 days.
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 7;
const SOFT_LOCK_DAY = 8;
const HARD_LOCK_DAY = 21;
const DATA_RETENTION_DAYS = 60;

export function deriveLockDates(graceStartedAtIso: string) {
  const start = new Date(graceStartedAtIso).getTime();
  return {
    graceEndsAt: new Date(start + GRACE_DAYS * DAY_MS).toISOString(),
    softLockAt: new Date(start + SOFT_LOCK_DAY * DAY_MS).toISOString(),
    hardLockAt: new Date(start + HARD_LOCK_DAY * DAY_MS).toISOString(),
    dataRetentionUntil: new Date(
      start + (HARD_LOCK_DAY + DATA_RETENTION_DAYS) * DAY_MS,
    ).toISOString(),
  };
}

const AUDIT_SNAPSHOT_FIELDS = [
  'plan',
  'subscriptionState',
  'billingStatus',
  'billingCycle',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'currentPeriodEnd',
  'cancelAtPeriodEnd',
  'trialEndsAt',
  'failedPaymentCount',
  'graceStartedAt',
  'pendingDowngradePlan',
  'pendingDowngradeAt',
] as const;

function auditSnapshot(data: Record<string, unknown> | undefined) {
  const source = data || {};
  return AUDIT_SNAPSHOT_FIELDS.reduce<Record<string, unknown>>((acc, field) => {
    if (source[field] !== undefined) acc[field] = source[field];
    return acc;
  }, {});
}

function unixToIso(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

/**
 * SOC2 F-05: `billing_state_audit`, written inside every transaction below, is a
 * private billing ledger — no audit or compliance surface reads it, so a plan
 * change, a cancellation or a period-end downgrade left nothing in `auditLogs`.
 * It is the same trap as `logActivity`: it looks like audit logging at the call
 * site and is not. The ledger is kept (it carries full before/after state); the
 * entries added here put the transition on the trail an auditor actually samples.
 */
export interface BillingAuditActor {
  userId: string;
  userEmail: string;
  userName: string;
}

/**
 * Billing state arrives from three places: a tenant admin acting in the app, a
 * Stripe webhook, and the billing cron. Only the first has a user, so a caller
 * that omits `actor` is attributed to the machine path that drove the change
 * rather than to whoever happened to be signed in.
 */
function resolveActor(
  actor: BillingAuditActor | undefined,
  source: string,
  fallbackUid?: string,
): BillingAuditActor {
  if (actor?.userId) return actor;
  if (fallbackUid) return { userId: fallbackUid, userEmail: '', userName: fallbackUid };
  return { userId: `system:${source}`, userEmail: '', userName: 'Billing system' };
}

export interface ApplySubscriptionStateInput {
  tenantId: string;
  source: Exclude<
    SubscriptionLifecycleSource,
    'payment.succeeded' | 'payment.failed' | 'lock.advanced'
  >;
  eventId?: string;
  /** Raw plan string from Stripe metadata (bizosto_plan). Unknown tiers fail closed. */
  plan?: unknown;
  /** Stripe subscription status (active, past_due, unpaid, canceled, trialing, ...). */
  stripeStatus?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Unix seconds from Stripe, or null. */
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
  /** Unix seconds from Stripe, or null. */
  trialEnd?: number | null;
  billingCycle?: 'monthly' | 'annual';
  /** Present when a signed-in admin drove the change; absent for webhook and cron. */
  actor?: BillingAuditActor;
}

export interface ApplyResult {
  ok: boolean;
  tenantExists: boolean;
  derived: Record<string, unknown>;
}

export async function applySubscriptionState(
  input: ApplySubscriptionStateInput,
): Promise<ApplyResult> {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) return { ok: false, tenantExists: false, derived: {} };

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const auditRef = adminDb.collection('billing_state_audit').doc();
  const nowIso = new Date().toISOString();

  // Captured inside the transaction so the trail entry can state the transition
  // rather than only its result. A retry overwrites these, leaving the values
  // read by the attempt that actually committed.
  let beforePlan: unknown = null;
  let beforeState: unknown = null;

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {} };
    }
    const before = snap.data() as Record<string, unknown>;
    beforePlan = before.plan ?? null;
    beforeState = before.subscriptionState ?? null;

    const derived: Record<string, unknown> = { updatedAt: nowIso };
    let auditWarning: string | null = null;

    if (input.stripeStatus) {
      derived.subscriptionState = mapStripeStatusToSubscriptionState(input.stripeStatus);
      derived.billingStatus = normalizeBillingStatus(input.stripeStatus);
    }

    if (input.source === 'checkout.linked') {
      // When Stripe reports trialing, preserve the canonical trial state established above.
      // checkout.linked means the workspace is operationally activated; it does not mean the
      // 14-day trial has already converted to a paid active subscription. Legacy callers that
      // do not supply stripeStatus still fall back to active for backward compatibility.
      if (!input.stripeStatus) {
        derived.subscriptionState = 'active';
        derived.billingStatus = 'active';
      }
      derived.status = 'active';
    }

    if (input.source === 'subscription.deleted') {
      derived.subscriptionState = 'hard_locked';
      derived.billingStatus = 'canceled';
      derived.plan = 'trial';
      // Explicitly clear entitlements: a canceled tenant keeps no paid-plan
      // module access or user/storage limits. History (invoices, finance_ledger)
      // lives in its own collections and is untouched.
      derived.modules = { ...LOCKED_MODULES };
      derived.modulesEnabled = { ...LOCKED_MODULES };
      derived.limits = { ...plans.trial.limits };
      derived.cancelAtPeriodEnd = false;
      // A cancellation supersedes any scheduled downgrade.
      derived.pendingDowngradePlan = null;
      derived.pendingDowngradeAt = null;
    }

    // SOC2 F-09: trial expiry and grace-period end are subscription lifecycle
    // transitions, but the trial-emails cron wrote them straight onto the tenant
    // document. That bypassed everything this service exists to guarantee: no
    // billing_state_audit record for the transition, no protected-tenant guard, and
    // no transactional re-read — so a checkout completing between the cron's read
    // and its write was silently overwritten with a downgrade.
    if (input.source === 'trial.expired' || input.source === 'trial.grace_ended') {
      if (PROTECTED_TENANTS.has(tenantId)) {
        return { ok: false, tenantExists: true, derived: {} };
      }
      // Re-derived inside the transaction: a tenant that has started paying is no
      // longer on the trial ladder, and the payment must win the race.
      if (String(before.billingStatus || '') === 'active') {
        return { ok: false, tenantExists: true, derived: {} };
      }

      if (input.source === 'trial.expired') {
        derived.status = 'grace_period';
        derived.subscriptionState = 'grace';
        derived.billingStatus = 'past_due';
      } else {
        derived.status = 'hard_locked';
        derived.subscriptionState = 'hard_locked';
        derived.billingStatus = 'canceled';
      }
    }

    const rawPlan = String(input.plan || '').trim();
    if (input.source !== 'subscription.deleted' && rawPlan) {
      if (isKnownPaidTier(rawPlan)) {
        // Modules and limits re-derived from the plan on every change.
        const planModules = resolvePlanModules(rawPlan as PlanTier);
        derived.plan = rawPlan;
        derived.modules = planModules;
        derived.modulesEnabled = planModules;
        derived.limits = { ...plans[rawPlan].limits };
      } else {
        // Fail closed: never write an unknown plan string or grant modules for it.
        auditWarning = `Unknown plan tier "${rawPlan}" — plan/modules/limits not updated`;
      }
    }

    if (input.stripeCustomerId) derived.stripeCustomerId = input.stripeCustomerId;
    if (input.stripeSubscriptionId) derived.stripeSubscriptionId = input.stripeSubscriptionId;
    if (input.billingCycle) derived.billingCycle = input.billingCycle;
    if (input.currentPeriodEnd !== undefined) {
      derived.currentPeriodEnd = unixToIso(input.currentPeriodEnd);
    }
    if (input.cancelAtPeriodEnd !== undefined) {
      derived.cancelAtPeriodEnd = Boolean(input.cancelAtPeriodEnd);
    }
    if (input.trialEnd !== undefined && input.trialEnd !== null) {
      derived.trialEndsAt = unixToIso(input.trialEnd);
    }

    tx.set(tenantRef, derived, { merge: true });
    tx.set(auditRef, {
      tenantId,
      source: input.source,
      eventId: input.eventId || null,
      warning: auditWarning,
      before: auditSnapshot(before),
      after: auditSnapshot({ ...before, ...derived }),
      at: nowIso,
    });

    return { ok: true, tenantExists: true, derived };
  });

  // Written AFTER the transaction resolves, never inside it. A Firestore
  // transaction retries on contention and AuditLogger.log performs its own
  // non-transactional write, so logging inside would emit one trail entry per
  // attempt and record transitions that never committed.
  if (result.ok) {
    const actor = resolveActor(input.actor, input.source);
    await AuditLogger.log({
      tenantId,
      userId: actor.userId,
      userEmail: actor.userEmail,
      userName: actor.userName,
      action: input.source === 'subscription.deleted' ? 'delete' : 'update',
      resource: 'subscription',
      resourceId: tenantId,
      changes: [
        { field: 'source', oldValue: null, newValue: input.source },
        { field: 'plan', oldValue: beforePlan, newValue: result.derived.plan ?? beforePlan },
        {
          field: 'subscriptionState',
          oldValue: beforeState,
          newValue: result.derived.subscriptionState ?? beforeState,
        },
      ],
      status: 'success',
    });
  }

  return result;
}

export async function applyPaymentSucceeded(input: {
  tenantId: string;
  eventId?: string;
}): Promise<ApplyResult> {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) return { ok: false, tenantExists: false, derived: {} };

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const auditRef = adminDb.collection('billing_state_audit').doc();
  const nowIso = new Date().toISOString();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {} };
    }
    const before = snap.data() as Record<string, unknown>;

    const derived: Record<string, unknown> = {
      subscriptionState: 'active',
      billingStatus: 'active',
      failedPaymentCount: 0,
      lastPaymentAt: nowIso,
      // Successful payment ends any dunning ladder in progress.
      graceStartedAt: null,
      graceEndsAt: null,
      softLockAt: null,
      hardLockAt: null,
      dataRetentionUntil: null,
      updatedAt: nowIso,
    };

    tx.set(tenantRef, derived, { merge: true });
    tx.set(auditRef, {
      tenantId,
      source: 'payment.succeeded',
      eventId: input.eventId || null,
      warning: null,
      before: auditSnapshot(before),
      after: auditSnapshot({ ...before, ...derived }),
      at: nowIso,
    });

    return { ok: true, tenantExists: true, derived };
  });
}

export async function applyPaymentFailed(input: {
  tenantId: string;
  eventId?: string;
}): Promise<ApplyResult & { failedPaymentCount: number }> {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) return { ok: false, tenantExists: false, derived: {}, failedPaymentCount: 0 };

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const auditRef = adminDb.collection('billing_state_audit').doc();
  const nowIso = new Date().toISOString();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {}, failedPaymentCount: 0 };
    }
    const before = snap.data() as Record<string, unknown>;

    const failedPaymentCount = Number(before.failedPaymentCount || 0) + 1;
    const graceStartedAt = String(before.graceStartedAt || '') || nowIso;

    const derived: Record<string, unknown> = {
      failedPaymentCount,
      subscriptionState: failedPaymentCount >= 3 ? 'soft_locked' : 'grace',
      billingStatus: 'past_due',
      graceStartedAt,
      ...deriveLockDates(graceStartedAt),
      updatedAt: nowIso,
    };

    tx.set(tenantRef, derived, { merge: true });
    tx.set(auditRef, {
      tenantId,
      source: 'payment.failed',
      eventId: input.eventId || null,
      warning: null,
      before: auditSnapshot(before),
      after: auditSnapshot({ ...before, ...derived }),
      at: nowIso,
    });

    return { ok: true, tenantExists: true, derived, failedPaymentCount };
  });
}

// ---------------------------------------------------------------------------
// Dunning lock-ladder advancement (locked founder decision):
// soft lock (read-only) from day 8 of the failed-payment ladder, hard lock
// from day 21. States are stamped as dates by applyPaymentFailed; the daily
// billing-locks cron advances subscriptionState when those dates pass.
// ---------------------------------------------------------------------------

const PROTECTED_TENANTS = new Set(['bizosto', 'bizosto-demo']);

export type LockAdvance = 'none' | 'soft_locked' | 'hard_locked';

export interface LockLadderTenantInput {
  tenantId: string;
  subscriptionState?: string;
  billingStatus?: string;
  softLockAt?: string | null;
  hardLockAt?: string | null;
}

export function classifyLockAdvance(input: LockLadderTenantInput, nowMs: number): LockAdvance {
  if (PROTECTED_TENANTS.has(input.tenantId)) return 'none';
  if (String(input.billingStatus || '') !== 'past_due') return 'none';

  const state = String(input.subscriptionState || '');
  if (state !== 'grace' && state !== 'soft_locked') return 'none';

  const hardAt = input.hardLockAt ? new Date(input.hardLockAt).getTime() : NaN;
  if (Number.isFinite(hardAt) && nowMs >= hardAt) {
    return 'hard_locked';
  }

  const softAt = input.softLockAt ? new Date(input.softLockAt).getTime() : NaN;
  if (state === 'grace' && Number.isFinite(softAt) && nowMs >= softAt) {
    return 'soft_locked';
  }

  return 'none';
}

export async function applyLockAdvance(input: {
  tenantId: string;
  to: Exclude<LockAdvance, 'none'>;
  eventId?: string;
}): Promise<ApplyResult> {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId || PROTECTED_TENANTS.has(tenantId)) {
    return { ok: false, tenantExists: false, derived: {} };
  }

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const auditRef = adminDb.collection('billing_state_audit').doc();
  const nowIso = new Date().toISOString();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {} };
    }
    const before = snap.data() as Record<string, unknown>;

    // Re-derive inside the transaction so a payment that succeeded between the
    // cron's read and this write can never be overwritten with a lock.
    const confirmed = classifyLockAdvance(
      {
        tenantId,
        subscriptionState: String(before.subscriptionState || ''),
        billingStatus: String(before.billingStatus || ''),
        softLockAt: (before.softLockAt as string | null) ?? null,
        hardLockAt: (before.hardLockAt as string | null) ?? null,
      },
      Date.now(),
    );
    if (confirmed !== input.to) {
      return { ok: false, tenantExists: true, derived: {} };
    }

    const derived: Record<string, unknown> = {
      subscriptionState: input.to,
      updatedAt: nowIso,
    };

    tx.set(tenantRef, derived, { merge: true });
    tx.set(auditRef, {
      tenantId,
      source: 'lock.advanced',
      eventId: input.eventId || null,
      warning: null,
      before: auditSnapshot(before),
      after: auditSnapshot({ ...before, ...derived }),
      at: nowIso,
    });

    return { ok: true, tenantExists: true, derived };
  });
}

export interface SchedulePendingDowngradeInput {
  tenantId: string;
  /** Target tier the tenant downgrades to at period end. */
  plan: PaidTier;
  /** ISO timestamp when the downgrade takes effect (current period end). */
  effectiveAtIso: string;
  actorUid: string;
  /** Richer identity for the trail when a signed-in admin drove the change. */
  actor?: BillingAuditActor;
}

/**
 * Records a period-end downgrade (locked decision: downgrades apply at period
 * end). Only stamps pendingDowngradePlan/pendingDowngradeAt + audit — the
 * entitlement change itself is applied later by the billing cron through
 * applySubscriptionState, so plan/modules stay canonical-service-only writes.
 */
export async function schedulePendingDowngrade(
  input: SchedulePendingDowngradeInput,
): Promise<ApplyResult> {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId || !isKnownPaidTier(input.plan)) {
    return { ok: false, tenantExists: false, derived: {} };
  }

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const auditRef = adminDb.collection('billing_state_audit').doc();
  const nowIso = new Date().toISOString();

  let beforePlan: unknown = null;

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {} };
    }
    const before = snap.data() as Record<string, unknown>;
    beforePlan = before.plan ?? null;

    const derived: Record<string, unknown> = {
      pendingDowngradePlan: input.plan,
      pendingDowngradeAt: input.effectiveAtIso,
      updatedAt: nowIso,
    };

    tx.set(tenantRef, derived, { merge: true });
    tx.set(auditRef, {
      tenantId,
      source: 'plan.downgrade_scheduled',
      eventId: `actor:${input.actorUid}`,
      warning: null,
      before: auditSnapshot(before),
      after: auditSnapshot({ ...before, ...derived }),
      at: nowIso,
    });

    return { ok: true, tenantExists: true, derived };
  });

  if (result.ok) {
    const actor = resolveActor(input.actor, 'plan.downgrade_scheduled', input.actorUid);
    await AuditLogger.log({
      tenantId,
      userId: actor.userId,
      userEmail: actor.userEmail,
      userName: actor.userName,
      action: 'update',
      resource: 'subscription',
      resourceId: tenantId,
      changes: [
        { field: 'pendingDowngradePlan', oldValue: beforePlan, newValue: input.plan },
        { field: 'pendingDowngradeAt', oldValue: null, newValue: input.effectiveAtIso },
      ],
      status: 'success',
    });
  }

  return result;
}

/**
 * Clears a scheduled downgrade (cancelled by the tenant, superseded by an
 * upgrade, or applied by the billing cron). Audit reason lands in `warning`.
 */
export async function clearPendingDowngrade(input: {
  tenantId: string;
  actorUid: string;
  reason?: string;
  /** Richer identity for the trail when a signed-in admin drove the change. */
  actor?: BillingAuditActor;
}): Promise<ApplyResult> {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) return { ok: false, tenantExists: false, derived: {} };

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const auditRef = adminDb.collection('billing_state_audit').doc();
  const nowIso = new Date().toISOString();

  let beforePending: unknown = null;

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {} };
    }
    const before = snap.data() as Record<string, unknown>;
    beforePending = before.pendingDowngradePlan ?? null;

    const derived: Record<string, unknown> = {
      pendingDowngradePlan: null,
      pendingDowngradeAt: null,
      updatedAt: nowIso,
    };

    tx.set(tenantRef, derived, { merge: true });
    tx.set(auditRef, {
      tenantId,
      source: 'plan.downgrade_cleared',
      eventId: `actor:${input.actorUid}`,
      warning: input.reason || null,
      before: auditSnapshot(before),
      after: auditSnapshot({ ...before, ...derived }),
      at: nowIso,
    });

    return { ok: true, tenantExists: true, derived };
  });

  if (result.ok) {
    const actor = resolveActor(input.actor, 'plan.downgrade_cleared', input.actorUid);
    await AuditLogger.log({
      tenantId,
      userId: actor.userId,
      userEmail: actor.userEmail,
      userName: actor.userName,
      action: 'update',
      resource: 'subscription',
      resourceId: tenantId,
      changes: [
        { field: 'pendingDowngradePlan', oldValue: beforePending, newValue: null },
        { field: 'reason', oldValue: null, newValue: input.reason || null },
      ],
      status: 'success',
    });
  }

  return result;
}
