/**
 * Canonical subscription lifecycle policy (P0-3a).
 *
 * Before this file the same facts were written independently on the pricing page, the
 * refund/cancellation page, the Terms and the Privacy Policy, and they disagreed:
 *
 *   - Pricing said the workspace is "paused and retained for 30 days" after the trial,
 *     which contradicts a card-required trial that auto-converts on day 15.
 *   - Pricing promised a 30-day money-back guarantee; the refund page and Terms both say
 *     elapsed periods and partial periods are non-refundable.
 *   - The refund page said data is kept 60 days; Terms and Privacy said 30 days, without
 *     either page saying which event starts the clock.
 *
 * Both retention windows are real, they just have different triggers. They are named
 * separately here so no page can imply one when it means the other.
 *
 * Every customer-facing lifecycle statement must be derived from this object.
 * `__tests__/lib/billing/lifecycle-policy-consistency.test.ts` fails the build if a page
 * hardcodes a lifecycle number or reintroduces a withdrawn promise.
 */

export const BILLING_LIFECYCLE = {
  trial: {
    /** Length of the free trial in days. */
    days: 14,
    /** A payment method is collected at signup. */
    cardRequired: true,
    /** The first charge is taken on this day if the trial was not cancelled. */
    firstChargeDay: 15,
    /** Cancel before the end of this day and nothing is ever charged. */
    lastFreeDay: 14,
  },

  failedPayment: {
    /** Full access continues while automatic retries run. */
    graceDays: 7,
    /** Workspace becomes read-only on this day of the dunning cycle. */
    readOnlyOnDay: 8,
    /** Workspace is hard-locked on this day if the balance is still outstanding. */
    hardLockOnDay: 21,
    /** Data is kept this long AFTER hard lock, then may be permanently deleted. */
    retentionDays: 60,
  },

  termination: {
    /** Data is kept this long AFTER a voluntary or for-cause account termination. */
    retentionDays: 30,
  },

  refunds: {
    /** No money-back guarantee is offered. Withdrawn in P0-3a as unenforced. */
    moneyBackGuaranteeDays: 0,
    /** Fees for billing periods that have already elapsed are not refundable. */
    elapsedPeriodsRefundable: false,
    /** No partial or prorated refund for unused time inside a period. */
    proratedRefundForUnusedTime: false,
    /** Business days for a refund to land back on the original payment method. */
    processingBusinessDaysMin: 5,
    processingBusinessDaysMax: 10,
  },

  planChanges: {
    upgradeEffective: 'immediately',
    upgradeProrated: true,
    downgradeEffective: 'end of the current billing period',
  },

  /** Both cycles are sold. Annual is priced at ten months. */
  billingCycles: ['monthly', 'annual'] as const,
  annualFreeMonths: 2,
} as const;

/**
 * Sentences that appear on more than one surface. Anything stated in two places must live
 * here so the two places cannot drift apart.
 */
export const LIFECYCLE_COPY = {
  trial:
    `New accounts receive a ${BILLING_LIFECYCLE.trial.days}-day free trial. A valid payment ` +
    `method is required at signup to begin the trial, but you will not be charged during the ` +
    `trial period. If you cancel at any time before the end of day ${BILLING_LIFECYCLE.trial.lastFreeDay}, ` +
    `you will not be charged anything. If you do not cancel, your subscription automatically ` +
    `converts to paid and billing begins on day ${BILLING_LIFECYCLE.trial.firstChargeDay} using ` +
    `the payment method provided at signup.`,

  failedPayment:
    `If a scheduled payment fails, Bizosto retries automatically and notifies you. A ` +
    `${BILLING_LIFECYCLE.failedPayment.graceDays}-day grace period applies with full access. On ` +
    `day ${BILLING_LIFECYCLE.failedPayment.readOnlyOnDay}, your account enters a read-only state. ` +
    `On day ${BILLING_LIFECYCLE.failedPayment.hardLockOnDay}, if payment is still outstanding, ` +
    `your account is hard-locked. Data is retained for ` +
    `${BILLING_LIFECYCLE.failedPayment.retentionDays} days after hard lock, after which it may be ` +
    `permanently deleted. You can restore access at any point before deletion by updating your ` +
    `payment method.`,

  termination:
    `Upon account termination, your data is retained for ` +
    `${BILLING_LIFECYCLE.termination.retentionDays} days in a read-only state, after which it is ` +
    `permanently deleted from our systems. This ${BILLING_LIFECYCLE.termination.retentionDays}-day ` +
    `window applies to a terminated account; the separate ` +
    `${BILLING_LIFECYCLE.failedPayment.retentionDays}-day window in our Refund & Cancellation ` +
    `Policy applies only after a hard lock for non-payment.`,

  refunds:
    `Subscription fees for billing periods that have already elapsed are non-refundable, except ` +
    `where required by law. Cancelling stops future charges but does not entitle you to a refund ` +
    `of fees already paid, and no partial or prorated refunds are issued for unused time within a ` +
    `billing period. Where a refund is issued, it is processed through Stripe to the original ` +
    `payment method and may take ${BILLING_LIFECYCLE.refunds.processingBusinessDaysMin}-` +
    `${BILLING_LIFECYCLE.refunds.processingBusinessDaysMax} business days to appear.`,

  planChanges:
    `Upgrades take effect ${BILLING_LIFECYCLE.planChanges.upgradeEffective} and are charged a ` +
    `prorated amount for the remainder of the current billing period at the new plan rate. ` +
    `Downgrades take effect at the ${BILLING_LIFECYCLE.planChanges.downgradeEffective}; you keep ` +
    `your current plan features until then, and the lower rate applies from the next period onward.`,
} as const;

/** Promises that were withdrawn and must never reappear in customer-facing copy. */
export const WITHDRAWN_CLAIMS = [
  'money-back guarantee',
  'money back guarantee',
  '30-day money-back',
  'satisfaction guarantee',
] as const;
