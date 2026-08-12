import fs from 'fs';
import path from 'path';
import {
  isComped,
  isCompExpired,
  resolveBillingMode,
  validateCompedGrant,
  COMPED_TYPES,
} from '@/lib/billing/billing-mode';

/**
 * COMP-1 — a workspace Bizosto has decided not to charge.
 *
 * Every billing path assumed a tenant is either paying Stripe or on its way to paying
 * Stripe. MRR-1 exposed the gap: Bizosto's own workspace, the demo tenant and every
 * hand-activated account fell into `unbilledActiveTenants`, a bucket named for anomalies,
 * when they are a permanent and legitimate state.
 *
 * `billingMode: 'comped'` makes that state explicit, and it has to hold at four places at
 * once — miss any one and the workspace is still wrong somewhere:
 *
 *   - Stripe checkout must refuse, or an admin clicking Upgrade starts charging a
 *     customer Bizosto chose not to charge.
 *   - The dunning cron must skip, or a stale past_due flag soft-locks and then hard-locks
 *     an account with no payment to fail.
 *   - Trial and billing email must skip, or an internal workspace gets "your trial ends in
 *     3 days — add a card".
 *   - Revenue reporting must count it separately, or the anomaly column stays useless.
 *
 * The behavioural half of this file exercises the resolver directly. The structural half
 * pins the four call sites, because a guard that is missing cannot be tested by calling it.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about comping is not mistaken for a guard. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const CHECKOUT = 'app/api/stripe/checkout/route.ts';
const LOCKS_CRON = 'app/api/cron/billing-locks/route.ts';
const TRIAL_CRON = 'app/api/cron/trial-emails/route.ts';
const PAYMENTS = 'app/api/super_admin/payments/route.ts';
const PLAN_ROUTE = 'app/api/super_admin/tenants/[tenantId]/plan/route.ts';

describe('COMP-1: billing mode defaults to paying', () => {
  it('treats an absent field as a normal Stripe customer', () => {
    // Every tenant document written before this field existed must behave exactly as it
    // does today. Being comped is a recorded decision, never an inference.
    expect(resolveBillingMode(undefined)).toBe('stripe');
    expect(resolveBillingMode(null)).toBe('stripe');
    expect(resolveBillingMode('')).toBe('stripe');
    expect(isComped({})).toBe(false);
    expect(isComped(null)).toBe(false);
  });

  it('recognises an explicit comp', () => {
    expect(resolveBillingMode('comped')).toBe('comped');
    expect(resolveBillingMode('COMPED')).toBe('comped');
    expect(isComped({ billingMode: 'comped' })).toBe(true);
  });

  it('treats an unrecognised value as paying rather than free', () => {
    // Failing towards "bill them" is the safe direction: the error surfaces as a billing
    // question, not as silently unbilled revenue.
    expect(resolveBillingMode('free')).toBe('stripe');
    expect(resolveBillingMode('trial')).toBe('stripe');
  });
});

describe('COMP-1: a comp must be attributable', () => {
  it('requires a recognised type', () => {
    for (const type of COMPED_TYPES) {
      const result = validateCompedGrant({ type, reason: 'x', expiresAt: null }, 'uid_1');
      expect(result.ok).toBe(true);
    }
    expect(validateCompedGrant({ type: 'freebie', reason: 'x' }, 'uid_1').ok).toBe(false);
    expect(validateCompedGrant({ reason: 'x' }, 'uid_1').ok).toBe(false);
  });

  it('requires a reason, because an unexplained comp is indistinguishable from a bug', () => {
    expect(validateCompedGrant({ type: 'internal', reason: '' }, 'uid_1').ok).toBe(false);
    expect(validateCompedGrant({ type: 'internal', reason: '   ' }, 'uid_1').ok).toBe(false);
    expect(validateCompedGrant({ type: 'internal', reason: 'x'.repeat(501) }, 'uid_1').ok).toBe(
      false,
    );
  });

  it('records who granted it and when', () => {
    const result = validateCompedGrant(
      { type: 'internal', reason: "Bizosto's own workspace", expiresAt: null },
      'uid_operator',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.grant.grantedByUid).toBe('uid_operator');
      expect(Number.isNaN(new Date(result.grant.grantedAt).getTime())).toBe(false);
    }
  });

  it('allows an open-ended comp but rejects a malformed expiry', () => {
    const openEnded = validateCompedGrant(
      { type: 'internal', reason: 'internal', expiresAt: null },
      'uid_1',
    );
    expect(openEnded.ok).toBe(true);
    if (openEnded.ok) expect(openEnded.grant.expiresAt).toBeNull();

    expect(
      validateCompedGrant({ type: 'partner', reason: 'x', expiresAt: 'someday' }, 'uid_1').ok,
    ).toBe(false);
  });

  it('rejects a non-object outright rather than half-writing a grant', () => {
    for (const bad of [null, undefined, 'internal', 42]) {
      expect(validateCompedGrant(bad, 'uid_1').ok).toBe(false);
    }
  });

  it('reports an expired comp without silently charging anyone', () => {
    const past = {
      type: 'promotional' as const,
      reason: 'x',
      grantedByUid: 'u',
      grantedAt: '',
      expiresAt: '2020-01-01T00:00:00.000Z',
    };
    const future = { ...past, expiresAt: '2999-01-01T00:00:00.000Z' };
    const open = { ...past, expiresAt: null };

    expect(isCompExpired(past)).toBe(true);
    expect(isCompExpired(future)).toBe(false);
    // An open-ended comp never lapses; an internal workspace has no end date.
    expect(isCompExpired(open)).toBe(false);
    expect(isCompExpired(null)).toBe(false);
  });
});

describe('COMP-1: a comped workspace is never charged', () => {
  it('Stripe checkout refuses before creating a session', () => {
    const src = active(CHECKOUT);
    expect(src).toContain('isComped(tenantData)');
    expect(src).toContain('billing_comped');

    // The refusal must precede session creation, or the charge happens anyway.
    const guardAt = src.indexOf('isComped(tenantData)');
    const sessionAt = src.indexOf('stripe.checkout.sessions.create');
    expect(guardAt).toBeGreaterThan(-1);
    expect(sessionAt).toBeGreaterThan(guardAt);
  });

  it('the checkout refusal does not read the mode from the request', () => {
    const src = active(CHECKOUT);
    expect(src).not.toMatch(/body\??\.\s*billingMode/);
  });
});

describe('COMP-1: a comped workspace is never dunned or chased', () => {
  it('the lock ladder skips it', () => {
    const src = active(LOCKS_CRON);
    expect(src).toContain('isComped(data)');
    expect(src).toContain('compedSkipped');

    // Skipping must happen before the advance is classified, not after it is applied.
    const guardAt = src.indexOf('isComped(data)');
    const classifyAt = src.indexOf('classifyLockAdvance(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(classifyAt).toBeGreaterThan(guardAt);
  });

  it('reports how many it skipped, so the skip is observable', () => {
    expect(active(LOCKS_CRON)).toMatch(/compedSkipped,/);
  });

  it('trial and billing email skips it', () => {
    const src = active(TRIAL_CRON);
    expect(src).toContain('isComped(tenantData)');

    // Before the trialEndsAt check: a comped tenant may still carry an old trial date.
    const guardAt = src.indexOf('isComped(tenantData)');
    const trialCheckAt = src.indexOf('if (!tenantData.trialEndsAt)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(trialCheckAt).toBeGreaterThan(guardAt);
  });
});

describe('COMP-1: a comped workspace contributes no revenue and is not an anomaly', () => {
  const src = active(PAYMENTS);

  it('is counted separately from genuinely unbilled tenants', () => {
    expect(src).toContain('compedTenants');
    expect(src).toContain('tenantIsComped');
    expect(src).toMatch(/else if \(tenantIsComped\)/);
  });

  it('never reaches the MRR accumulation', () => {
    // The comped branch sits between the paying branch and the anomaly branch, so a
    // comped tenant can only ever land in exactly one of the three.
    const payingAt = src.indexOf('mrr += plans[plan].price');
    const compedAt = src.indexOf('else if (tenantIsComped)');
    expect(compedAt).toBeGreaterThan(payingAt);
  });

  it('surfaces the count on the payments screen', () => {
    const page = read('app/super_admin/payments/page.tsx');
    expect(page).toContain('metrics.compedTenants');
    expect(page).toContain('Internally managed, $0');
  });
});

describe('COMP-1: only a Super Admin sets billing mode, and it is audited', () => {
  const src = active(PLAN_ROUTE);

  it('accepts billingMode on the Super Admin plan route', () => {
    expect(src).toContain('billingModeProvided');
    expect(src).toContain('validateCompedGrant(body?.comped, user.uid)');
  });

  it('rejects a comp that fails validation instead of writing a partial one', () => {
    const validateAt = src.indexOf('validateCompedGrant(');
    const writeAt = src.indexOf('tenantRef.set(updates');
    expect(validateAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(validateAt);
    expect(src).toMatch(/if \(!grant\.ok\)/);
  });

  it('clears the grant when converting back to Stripe billing', () => {
    expect(src).toContain('FieldValue.delete()');
  });

  it('records the before and after in the audit log', () => {
    expect(src).toContain('oldBillingMode');
    expect(src).toContain('newBillingMode');
    expect(src).toContain('oldComped');
    expect(src).toContain('newComped');
  });
});
