import fs from 'fs';
import path from 'path';
import {
  BILLING_LIFECYCLE,
  LIFECYCLE_COPY,
  WITHDRAWN_CLAIMS,
} from '@/lib/billing/lifecycle-policy';

/**
 * P0-3a — one source of truth for the subscription lifecycle.
 *
 * The Terms, Privacy Policy and Refund & Cancellation page each stated the lifecycle
 * independently and disagreed with each other and with what the product actually does.
 * Every lifecycle sentence on those pages is now derived from lib/billing/lifecycle-policy.ts.
 * This test fails the build if a page hardcodes a lifecycle number again, or if a withdrawn
 * promise reappears.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const LEGAL_PAGES = [
  'app/refund-cancellation/page.tsx',
  'app/terms/page.tsx',
  'app/privacy/page.tsx',
];

describe('P0-3a: the policy object matches the locked business model', () => {
  it('trial is card-required, 14 days, first charge on day 15', () => {
    expect(BILLING_LIFECYCLE.trial.days).toBe(14);
    expect(BILLING_LIFECYCLE.trial.cardRequired).toBe(true);
    expect(BILLING_LIFECYCLE.trial.firstChargeDay).toBe(15);
    expect(BILLING_LIFECYCLE.trial.lastFreeDay).toBe(14);
  });

  it('the dunning ladder is 7-day grace, read-only day 8, hard lock day 21', () => {
    expect(BILLING_LIFECYCLE.failedPayment.graceDays).toBe(7);
    expect(BILLING_LIFECYCLE.failedPayment.readOnlyOnDay).toBe(8);
    expect(BILLING_LIFECYCLE.failedPayment.hardLockOnDay).toBe(21);
  });

  it('the ladder is internally coherent', () => {
    const { graceDays, readOnlyOnDay, hardLockOnDay } = BILLING_LIFECYCLE.failedPayment;
    expect(readOnlyOnDay).toBe(graceDays + 1);
    expect(hardLockOnDay).toBeGreaterThan(readOnlyOnDay);
  });

  it('the two retention windows are distinct and both stated', () => {
    expect(BILLING_LIFECYCLE.failedPayment.retentionDays).toBe(60);
    expect(BILLING_LIFECYCLE.termination.retentionDays).toBe(30);
    expect(BILLING_LIFECYCLE.failedPayment.retentionDays).not.toBe(
      BILLING_LIFECYCLE.termination.retentionDays,
    );
  });

  it('no money-back guarantee is offered', () => {
    expect(BILLING_LIFECYCLE.refunds.moneyBackGuaranteeDays).toBe(0);
    expect(BILLING_LIFECYCLE.refunds.elapsedPeriodsRefundable).toBe(false);
    expect(BILLING_LIFECYCLE.refunds.proratedRefundForUnusedTime).toBe(false);
  });

  it('both billing cycles are sold', () => {
    expect(BILLING_LIFECYCLE.billingCycles).toEqual(['monthly', 'annual']);
    expect(BILLING_LIFECYCLE.annualFreeMonths).toBe(2);
  });
});

describe('P0-3a: derived copy states the facts it claims to state', () => {
  it('trial copy names the trial length, the last free day and the first charge day', () => {
    expect(LIFECYCLE_COPY.trial).toContain(`${BILLING_LIFECYCLE.trial.days}-day free trial`);
    expect(LIFECYCLE_COPY.trial).toContain(`day ${BILLING_LIFECYCLE.trial.lastFreeDay}`);
    expect(LIFECYCLE_COPY.trial).toContain(`day ${BILLING_LIFECYCLE.trial.firstChargeDay}`);
  });

  it('failed-payment copy names every rung of the ladder', () => {
    const copy = LIFECYCLE_COPY.failedPayment;
    expect(copy).toContain(`${BILLING_LIFECYCLE.failedPayment.graceDays}-day grace period`);
    expect(copy).toContain(`day ${BILLING_LIFECYCLE.failedPayment.readOnlyOnDay}`);
    expect(copy).toContain(`day ${BILLING_LIFECYCLE.failedPayment.hardLockOnDay}`);
    expect(copy).toContain(`${BILLING_LIFECYCLE.failedPayment.retentionDays} days after hard lock`);
  });

  it('termination copy disambiguates the two retention windows', () => {
    const copy = LIFECYCLE_COPY.termination;
    expect(copy).toContain(`${BILLING_LIFECYCLE.termination.retentionDays} days`);
    expect(copy).toContain(`${BILLING_LIFECYCLE.failedPayment.retentionDays}-day window`);
    expect(copy).toMatch(/hard lock for non-payment/i);
  });

  it('refund copy rules out both elapsed and prorated refunds', () => {
    expect(LIFECYCLE_COPY.refunds).toMatch(/non-refundable/i);
    expect(LIFECYCLE_COPY.refunds).toMatch(/no partial or prorated refunds/i);
  });
});

describe('P0-3a: legal pages derive lifecycle statements, never hardcode them', () => {
  it.each(LEGAL_PAGES)('%s imports the canonical policy', (rel) => {
    expect(read(rel)).toContain("from '@/lib/billing/lifecycle-policy'");
  });

  it.each(LEGAL_PAGES)('%s contains no hardcoded lifecycle day counts', (rel) => {
    const src = read(rel);
    const forbidden = [
      /\b14-day free trial\b/,
      /\bday 15\b/,
      /\b7-day grace\b/,
      /\bon day 8\b/,
      /\bon day 21\b/,
      /\b60 days after hard lock\b/,
      /retained for 30 days/,
    ];
    const hits = forbidden.filter((rx) => rx.test(src)).map(String);
    expect(hits).toEqual([]);
  });

  it.each(LEGAL_PAGES)('%s contains no withdrawn promise', (rel) => {
    const src = read(rel).toLowerCase();
    const hits = WITHDRAWN_CLAIMS.filter(
      (claim) => src.includes(claim) && !src.includes(`does not offer a ${claim}`),
    );
    expect(hits).toEqual([]);
  });

  it('the refund page states the failed-payment ladder via the policy', () => {
    expect(read('app/refund-cancellation/page.tsx')).toContain('LIFECYCLE_COPY.failedPayment');
  });

  it('terms and privacy both state termination retention via the policy', () => {
    expect(read('app/terms/page.tsx')).toContain('LIFECYCLE_COPY.termination');
    expect(read('app/privacy/page.tsx')).toContain('LIFECYCLE_COPY.termination');
  });

  it('terms no longer claims billing is monthly only', () => {
    const src = read('app/terms/page.tsx');
    expect(src).not.toContain('billed monthly via Stripe');
    expect(src).toContain('BILLING_LIFECYCLE.billingCycles');
  });
});
