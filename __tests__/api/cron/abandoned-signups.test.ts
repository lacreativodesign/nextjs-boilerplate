import fs from 'fs';
import path from 'path';
import { classifyAbandonedTenant, deletionDateIso } from '@/lib/tenant/abandoned-signups';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-05T00:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

const base = (over: Record<string, unknown> = {}) => ({
  tenantId: 'tenant_x',
  createdAt: daysAgo(5),
  subscriptionState: 'trial',
  ...over,
});

describe('abandoned-signup lifecycle (P0-2)', () => {
  it('never touches protected platform tenants', () => {
    expect(
      classifyAbandonedTenant(base({ tenantId: 'bizosto', createdAt: daysAgo(90) }), NOW),
    ).toBe('skip');
    expect(
      classifyAbandonedTenant(base({ tenantId: 'bizosto-demo', createdAt: daysAgo(90) }), NOW),
    ).toBe('skip');
  });

  it('never touches tenants with any Stripe linkage or active billing', () => {
    expect(
      classifyAbandonedTenant(base({ createdAt: daysAgo(90), stripeSubscriptionId: 'sub_1' }), NOW),
    ).toBe('skip');
    expect(
      classifyAbandonedTenant(base({ createdAt: daysAgo(90), stripeCustomerId: 'cus_1' }), NOW),
    ).toBe('skip');
    expect(
      classifyAbandonedTenant(base({ createdAt: daysAgo(90), billingStatus: 'active' }), NOW),
    ).toBe('skip');
    expect(
      classifyAbandonedTenant(base({ createdAt: daysAgo(90), subscriptionState: 'active' }), NOW),
    ).toBe('skip');
  });

  it('skips tenants with missing or invalid createdAt instead of deleting them', () => {
    expect(classifyAbandonedTenant(base({ createdAt: undefined }), NOW)).toBe('skip');
    expect(classifyAbandonedTenant(base({ createdAt: 'not-a-date' }), NOW)).toBe('skip');
  });

  it('does nothing before day 18', () => {
    expect(classifyAbandonedTenant(base({ createdAt: daysAgo(10) }), NOW)).toBe('none');
    expect(classifyAbandonedTenant(base({ createdAt: daysAgo(17) }), NOW)).toBe('none');
  });

  it('sends first reminder at day 18, once', () => {
    expect(classifyAbandonedTenant(base({ createdAt: daysAgo(18) }), NOW)).toBe('remind_first');
    expect(
      classifyAbandonedTenant(
        base({ createdAt: daysAgo(19), firstReminderSentAt: daysAgo(1) }),
        NOW,
      ),
    ).toBe('none');
  });

  it('sends final reminder at day 25, once', () => {
    expect(classifyAbandonedTenant(base({ createdAt: daysAgo(25) }), NOW)).toBe('remind_final');
    expect(
      classifyAbandonedTenant(
        base({ createdAt: daysAgo(26), finalReminderSentAt: daysAgo(1) }),
        NOW,
      ),
    ).toBe('none');
  });

  it('deletes at day 30', () => {
    expect(classifyAbandonedTenant(base({ createdAt: daysAgo(30) }), NOW)).toBe('delete');
    expect(classifyAbandonedTenant(base({ createdAt: daysAgo(45) }), NOW)).toBe('delete');
  });

  it('applies the same lifecycle to S38 pending_checkout tenants', () => {
    const pending = (over: Record<string, unknown> = {}) =>
      base({ subscriptionState: 'pending_checkout', ...over });
    expect(classifyAbandonedTenant(pending({ createdAt: daysAgo(10) }), NOW)).toBe('none');
    expect(classifyAbandonedTenant(pending({ createdAt: daysAgo(18) }), NOW)).toBe('remind_first');
    expect(classifyAbandonedTenant(pending({ createdAt: daysAgo(25) }), NOW)).toBe('remind_final');
    expect(classifyAbandonedTenant(pending({ createdAt: daysAgo(30) }), NOW)).toBe('delete');
    // Still never touched once billing is active or Stripe is linked.
    expect(
      classifyAbandonedTenant(pending({ createdAt: daysAgo(45), stripeCustomerId: 'cus_1' }), NOW),
    ).toBe('skip');
  });

  it('computes the deletion date 30 days after signup', () => {
    const createdAt = daysAgo(20);
    expect(deletionDateIso(createdAt)).toBe(new Date(NOW + 10 * DAY_MS).toISOString());
  });
});

describe('signup OTP hardening — static gates (P0-2)', () => {
  const signupSrc = fs.readFileSync(
    path.join(process.cwd(), 'app', 'api', 'signup', 'route.ts'),
    'utf8',
  );

  it('creates the Firebase user with emailVerified true (email proven via OTP)', () => {
    expect(signupSrc).toContain('emailVerified: true');
    expect(signupSrc).not.toContain('emailVerified: false');
  });

  it('consumes the OTP atomically BEFORE provisioning (E7)', () => {
    // E7 changed this: the OTP used to be deleted best-effort AFTER provisioning,
    // which left a TOCTOU window where two concurrent requests could each
    // provision a tenant from one verified code. It is now validated and burned
    // inside a single transaction before any Auth user or tenant is created.
    expect(signupSrc).toContain('adminDb.runTransaction');
    expect(signupSrc).toContain('tx.delete(otpRef)');
    expect(signupSrc).not.toContain("collection('email_otps').doc(email).delete()");
    expect(signupSrc.indexOf('tx.delete(otpRef)')).toBeLessThan(
      signupSrc.indexOf('adminAuth.createUser'),
    );
  });

  it('runs through the sole daily orchestrator rather than a second schedule', () => {
    const vercel = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
    const registry = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'cron', 'registry.ts'),
      'utf8',
    );
    expect(vercel).not.toContain('/api/cron/abandoned-signups');
    expect(registry).toContain("'/api/cron/abandoned-signups'");
  });
});
