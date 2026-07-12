import * as fs from 'fs';
import * as path from 'path';

/**
 * Signup flow gate (S34, audit P0-4).
 *
 * OTP email verification is the canonical signup verification path. The legacy
 * signup_verifications / PUT signupToken flow is retired: it had zero callers,
 * duplicated verification, seeded demo workflow templates (violating the locked
 * "new workspaces start empty" decision), and created a stale verification doc
 * on every live signup. These assertions keep the canonical flow intact and the
 * legacy flow from returning.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('signup flow gate', () => {
  const signupRoute = read('app/api/signup/route.ts');

  it('legacy signup_verifications flow is fully removed', () => {
    expect(signupRoute).not.toContain('signup_verifications');
    expect(signupRoute).not.toContain('SignupVerificationRecord');
    expect(signupRoute).not.toContain('signupToken');
    expect(signupRoute).not.toContain('WORKFLOW_TEMPLATES');
  });

  it('PUT is a deprecated 410 stub with no data access', () => {
    const putIndex = signupRoute.indexOf('export async function PUT');
    expect(putIndex).toBeGreaterThan(-1);
    const putBody = signupRoute.slice(putIndex);
    expect(putBody).toContain('status: 410');
    expect(putBody).not.toContain('adminDb');
    expect(putBody).not.toContain('adminAuth');
  });

  it('tenant and user are provisioned only after a verified OTP', () => {
    const otpGate = signupRoute.indexOf("collection('email_otps')");
    const otpVerifiedCheck = signupRoute.indexOf('verified !== true');
    const userCreation = signupRoute.indexOf('adminAuth.createUser');
    const tenantCreation = signupRoute.indexOf('await createTenantWorkspace({');

    expect(otpGate).toBeGreaterThan(-1);
    expect(otpVerifiedCheck).toBeGreaterThan(-1);
    expect(userCreation).toBeGreaterThan(-1);
    expect(tenantCreation).toBeGreaterThan(-1);
    // Gate strictly precedes provisioning.
    expect(otpVerifiedCheck).toBeLessThan(userCreation);
    expect(userCreation).toBeLessThan(tenantCreation);
  });

  it('users are created emailVerified (E7: OTP burned transactionally, see below)', () => {
    expect(signupRoute).toContain('emailVerified: true');
  });

  it('OTP is consumed ATOMICALLY and BEFORE any provisioning (E7)', () => {
    // The old code only READ the OTP here and deleted it at the very end, leaving a
    // TOCTOU window in which two concurrent requests both saw verified:true and each
    // provisioned an Auth user + tenant from one code. The consume must now happen
    // inside a transaction that also validates it, before any provisioning.
    expect(signupRoute).toContain('adminDb.runTransaction');
    expect(signupRoute).toContain('tx.delete(otpRef)');

    const consume = signupRoute.indexOf('tx.delete(otpRef)');
    const userCreation = signupRoute.indexOf('adminAuth.createUser');
    const tenantCreation = signupRoute.indexOf('await createTenantWorkspace({');

    expect(consume).toBeGreaterThan(-1);
    // The OTP is burned strictly before an Auth user or tenant is created.
    expect(consume).toBeLessThan(userCreation);
    expect(consume).toBeLessThan(tenantCreation);

    // The old best-effort trailing delete must be gone — it is what allowed the race.
    expect(signupRoute).not.toContain("collection('email_otps').doc(email).delete()");
  });

  it('custom claims always include both role and tenantId', () => {
    expect(signupRoute).toMatch(
      /setCustomUserClaims\(authUser\.uid, \{\s*role: 'admin',\s*tenantId,\s*\}\)/,
    );
  });

  it('tenant is provisioned in pending_checkout — access activates only after Stripe Checkout (S38)', () => {
    expect(signupRoute).toContain("subscriptionState: 'pending_checkout'");
    // Signup must never grant a live trial/active state itself; the
    // checkout.session.completed webhook is the only activation writer.
    expect(signupRoute).not.toContain("subscriptionState: 'trial'");
    expect(signupRoute).not.toContain("subscriptionState: 'active'");
  });
});
