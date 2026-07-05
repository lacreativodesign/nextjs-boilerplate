import { adminDb } from '@/lib/firebaseAdmin';
import { plans } from '@/lib/billing/plans';
import { resolvePlanModules, type PlanTier } from '@/lib/tenant/plan-access';

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
  | 'payment.failed';

const KNOWN_PAID_TIERS = ['starter', 'pro', 'enterprise'] as const;
export type PaidTier = (typeof KNOWN_PAID_TIERS)[number];

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
      return 'active';
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

export interface ApplySubscriptionStateInput {
  tenantId: string;
  source: Exclude<SubscriptionLifecycleSource, 'payment.succeeded' | 'payment.failed'>;
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

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tenantRef);
    if (!snap.exists) {
      return { ok: false, tenantExists: false, derived: {} };
    }
    const before = snap.data() as Record<string, unknown>;

    const derived: Record<string, unknown> = { updatedAt: nowIso };
    let auditWarning: string | null = null;

    if (input.stripeStatus) {
      derived.subscriptionState = mapStripeStatusToSubscriptionState(input.stripeStatus);
      derived.billingStatus = normalizeBillingStatus(input.stripeStatus);
    }

    if (input.source === 'checkout.linked') {
      derived.subscriptionState = 'active';
      derived.billingStatus = 'active';
      derived.status = 'active';
    }

    if (input.source === 'subscription.deleted') {
      derived.subscriptionState = 'hard_locked';
      derived.billingStatus = 'canceled';
      derived.plan = 'trial';
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
