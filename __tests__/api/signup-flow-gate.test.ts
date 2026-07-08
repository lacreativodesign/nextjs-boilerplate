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

  it('users are created emailVerified and OTP is consumed after success', () => {
    expect(signupRoute).toContain('emailVerified: true');
    expect(signupRoute).toContain("collection('email_otps').doc(email).delete()");
  });

  it('custom claims always include both role and tenantId', () => {
    expect(signupRoute).toMatch(
      /setCustomUserClaims\(authUser\.uid, \{\s*role: 'admin',\s*tenantId,\s*\}\)/,
    );
  });
});
