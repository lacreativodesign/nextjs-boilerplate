import { adminAuth } from '@/lib/firebaseAdmin';

/**
 * SOC2 F-05 / CC6.2: propagate a role change to Firebase Auth.
 *
 * Bizosto enforces authorization in two places. API routes read the role from the
 * Firestore user document via `getCurrentUserOrThrow`, so a role written there takes
 * effect on the next request. Firestore security rules are the second layer and read
 * the CUSTOM CLAIM, which a Firestore write does not touch.
 *
 * `admin/users/update` changed `users/{uid}.role` and stopped there, so after a
 * demotion the two layers disagreed until someone remembered to run
 * `/api/super_admin/repair-claims` by hand. A control that depends on an operator
 * remembering to run a repair job is not a control.
 *
 * Setting the claim alone is still not enough. A Firebase session cookie embeds the
 * claims that existed when it was minted, and this app issues cookies lasting one to
 * fourteen days. `setCustomUserClaims` does not reach back into an issued cookie, so
 * a demoted user would carry their old role until it expired. `revokeRefreshTokens`
 * is what ends it: `lib/tenant/server.ts` verifies with
 * `verifySessionCookie(cookie, true)`, and that `true` makes revocation take effect
 * on the very next request. The user is signed out and signs back in with the role
 * they now have — which is exactly what revoking access is supposed to mean.
 *
 * Existing claims are spread rather than replaced, matching repair-claims: any claim
 * added later by another feature must survive a role change.
 */
export async function syncUserClaims(params: {
  uid: string;
  role: string;
  tenantId: string;
  /** End live sessions. True for a role change; false for a cosmetic profile edit. */
  endSessions?: boolean;
}): Promise<void> {
  const { uid, role, tenantId, endSessions = false } = params;
  if (!uid || !role) return;

  const authUser = await adminAuth.getUser(uid);
  const existing = (authUser.customClaims || {}) as Record<string, unknown>;

  // Both keys are always written together. A claim carrying a role without a tenant
  // is what the repair job exists to clean up.
  await adminAuth.setCustomUserClaims(uid, { ...existing, role, tenantId });

  if (endSessions) {
    await adminAuth.revokeRefreshTokens(uid);
  }
}
