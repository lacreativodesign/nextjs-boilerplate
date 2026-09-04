import fs from 'fs';
import path from 'path';

// PR2 lifecycle invariants are release-safety contracts and must remain enforced in CI.
const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('Tenant Safety PR2 — signup and activation invariants', () => {
  const signup = read('app/api/signup/route.ts');
  const verifyOtp = read('app/api/auth/verify-otp/route.ts');
  const checkout = read('app/api/stripe/checkout/route.ts');
  const webhook = read('app/api/stripe/webhook/route.ts');
  const billingService = read('lib/billing/apply-subscription-state.ts');
  const settings = read('app/api/admin/settings/system/route.ts');
  const middleware = read('middleware.ts');
  const activationBridge = read('app/billing/activating/page.tsx');

  it('keeps a newly provisioned tenant locked until signed Stripe activation', () => {
    expect(signup).toContain("subscriptionState: 'pending_checkout'");
    expect(signup).toContain("activationStatus: 'pending_checkout'");
    expect(signup).toContain('currencyLockedAt: null');
    expect(signup).toContain('trialEndsAt: null');
  });

  it('requires and normalizes a supported single workspace currency', () => {
    expect(signup).toContain("currency: z.string().trim().length(3, 'Currency is required')");
    expect(signup).toContain('const currency = payload.currency.toUpperCase()');
    expect(signup).toContain('SUPPORTED_CURRENCIES.has(currency)');
    expect(signup).toMatch(/settings:\s*\{[\s\S]{0,200}currency,/);
  });

  it('rolls back every owned signup artifact after a partial provisioning failure', () => {
    expect(signup).toContain('cleanupFailedSignup');
    expect(signup).toContain("collection('users').doc(uid).delete()");
    expect(signup).toContain("recursiveDelete(adminDb.collection('tenants').doc(tenantId))");
    expect(signup).toContain("collection('scheduled_emails').doc(tenantId).delete()");
    expect(signup).toContain('adminAuth.deleteUser(uid)');
    expect(signup.indexOf('createdTenantId = tenantId')).toBeGreaterThan(
      signup.indexOf('await createTenantWorkspace({'),
    );
  });

  it('serializes OTP expiry, attempt counting, lockout and verification in one transaction', () => {
    expect(verifyOtp).toContain('const MAX_ATTEMPTS = 5');
    expect(verifyOtp).toContain('adminDb.runTransaction<VerifyResult>');
    expect(verifyOtp).toContain('const attempts = Number(data.attempts || 0)');
    expect(verifyOtp).toContain('attempts: nextAttempts');
    expect(verifyOtp).toContain('verified: true');
    expect(verifyOtp).toContain('tx.delete(ref)');
  });

  it('binds initial checkout plan, billing email and trial policy to server-owned tenant state', () => {
    expect(checkout).toContain(
      "const isInitialCheckout = subscriptionState === 'pending_checkout'",
    );
    expect(checkout).toContain('if (provisionedPlan !== config.plan)');
    expect(checkout).toContain("code: 'signup_plan_mismatch'");
    expect(checkout).toContain(
      'const customerEmail = await resolveBillingEmail(tenantData, auth.user)',
    );
    expect(checkout).not.toContain('body?.customerEmail');
    expect(checkout).not.toContain('body?.trialPeriodDays');
    expect(checkout).toContain('isInitialCheckout ? INITIAL_TRIAL_DAYS : undefined');
    expect(checkout).toContain('client_reference_id: tenantId');
  });

  it('does not depend on webhook/redirect ordering after initial Stripe checkout', () => {
    expect(checkout).toContain('isInitialCheckout\n      ? `${appUrl}/billing/activating`');
    expect(activationBridge).toContain('const MAX_ATTEMPTS = 60');
    expect(activationBridge).toContain("fetch('/api/subscription/status'");
    expect(activationBridge).toContain("state === 'trial' || state === 'active'");
    expect(activationBridge).toContain("state !== 'pending_checkout'");
    expect(activationBridge).toContain("router.replace('/onboarding?signup=success')");
    expect(activationBridge).toContain("router.replace('/billing')");
  });

  it('reconciles the signed app checkout against the actual Stripe subscription before activation', () => {
    expect(webhook).toContain('stripe.subscriptions.retrieve(stripeSubscriptionId)');
    expect(webhook).toContain("source === 'bizosto_app'");
    expect(webhook).toContain('subscriptionMetadata.tenantId !== metadataTenantId');
    expect(webhook).toContain('subscriptionMetadata.bizosto_plan !== metadataPlan');
    expect(webhook).toContain('subscriptionCustomerId !== stripeCustomerId');
    expect(webhook).toContain('provisionedPlan !== metadataPlan');
    expect(webhook).toContain('trialEnd: subscription.trial_end');
  });

  it('atomically owns first activation and currency locking in the canonical billing transaction', () => {
    expect(billingService).toContain('const pendingCheckoutActivation =');
    expect(billingService).toContain("input.source === 'checkout.linked'");
    expect(billingService).toContain('derived.activatedAt = nowIso');
    expect(billingService).toContain('derived.currencyLockedAt = nowIso');
    expect(billingService).toContain("derived.currencyLockedBy = 'stripe_checkout'");
    expect(billingService).toContain('derived.lastBillingActivationAt = nowIso');
    expect(billingService).toContain("disposition: 'deferred_pending_checkout' as const");
    expect(billingService).toContain('tx.set(tenantRef, derived, { merge: true })');
  });

  it('rejects canonical currency changes after activation inside one Firestore transaction', () => {
    expect(settings).toContain('const currencyDecision = await adminDb.runTransaction');
    expect(settings).toContain('const tenantSnap = await tx.get(tenantRef)');
    expect(settings).toContain('const currencyLocked = Boolean(tenantData.currencyLockedAt)');
    expect(settings).toContain("code: 'currency_locked'");
    expect(settings).toContain("'settings.currency': requestedCurrency");
    expect(settings).toContain('tx.update(tenantRef');
    expect(settings.indexOf("code: 'currency_locked'")).toBeLessThan(
      settings.indexOf("'settings.currency': requestedCurrency"),
    );
  });

  it('keeps pending/locked tenants blocked everywhere except the narrow billing recovery surface', () => {
    expect(middleware).toContain('const isBillingRecoveryRequest =');
    expect(middleware).toContain("pathname === '/api/stripe/checkout'");
    expect(middleware).toContain("pathname === '/api/billing/subscription'");
    expect(middleware).toContain('!isBillingRecoveryRequest');
    // The checkout API is not public: its route still requires an authenticated admin session.
    expect(checkout).toContain('requireAdminOrSuperAdmin()');
  });
});
