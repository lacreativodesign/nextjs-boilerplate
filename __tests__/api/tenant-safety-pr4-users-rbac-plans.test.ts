import fs from 'fs';
import path from 'path';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const INVITE_ROUTE = 'app/api/users/invite/route.ts';
const USER_SERVICE = 'lib/users/user-service.ts';
const LEGACY_CREATE = 'app/api/create-user/route.ts';
const SSO_OAUTH = 'lib/auth/sso-oauth.ts';
const LEGACY_UPDATE = 'app/api/admin/users/[uid]/update/route.ts';
const ADMIN_UPDATE = 'app/api/admin/users/update/route.ts';
const HR_CREATE = 'app/api/hr/employees/create/route.ts';
const HR_UPDATE = 'app/api/hr/employees/update/route.ts';
const HR_DELETE = 'app/api/hr/employees/delete/route.ts';
const USER_LIMIT = 'lib/billing/user-limit.ts';
const ACCESS_STATE = 'lib/auth/user-access-state.ts';
const PLAN_ROUTE = 'app/api/super_admin/tenants/[tenantId]/plan/route.ts';

describe('PR4 tenant role allow-list semantics', () => {
  it('preserves a completely missing legacy role map', () => {
    const roles = resolveTenantRoles(undefined);
    expect(roles.admin).toBe(true);
    expect(roles.sales).toBe(true);
    expect(roles.hr).toBe(true);
    expect(roles.client).toBe(true);
  });

  it('fails closed for omitted keys once an explicit role map exists', () => {
    const roles = resolveTenantRoles({ sales: true });
    expect(isRoleEnabled(roles, 'sales')).toBe(true);
    expect(isRoleEnabled(roles, 'finance')).toBe(false);
    expect(isRoleEnabled(roles, 'hr')).toBe(false);
  });

  it('fails closed for malformed role maps while keeping super_admin platform-level', () => {
    const roles = resolveTenantRoles([]);
    expect(Object.values(roles).every((enabled) => enabled === false)).toBe(true);
    expect(isRoleEnabled(roles, 'super_admin')).toBe(true);
  });
});

describe('PR4 invitation authorization and provisioning', () => {
  const inviteRoute = read(INVITE_ROUTE);
  const userService = read(USER_SERVICE);

  it('does not recognize legacy owner/manager roles as invitation authorities', () => {
    expect(inviteRoute).not.toContain("normalized === 'owner'");
    expect(inviteRoute).not.toContain("normalized === 'manager'");
    expect(inviteRoute).toContain('isAdminRole(requesterRole)');
    expect(inviteRoute).toContain('Permission.ManageUsers');
    expect(inviteRoute).toContain('Permission.ManageRoles');
  });

  it('enforces tenant role enablement both when issuing and accepting an invite', () => {
    expect(inviteRoute).toContain('resolveTenantRoles(tenantSnap.data()?.rolesEnabled)');
    expect(inviteRoute).toContain('isRoleEnabled(rolesEnabled, data.role)');
    expect(userService).toContain('resolveTenantRoles(tenantSnap.data()?.rolesEnabled)');
    expect(userService).toContain('isRoleEnabled(rolesEnabled, invitationRole)');
  });

  it('stamps role and tenant claims before making an invitation accepted', () => {
    const claimsIndex = userService.indexOf('await syncUserClaims({');
    const batchIndex = userService.indexOf('const batch = adminDb.batch();', claimsIndex);
    const commitIndex = userService.indexOf('await batch.commit();', batchIndex);

    expect(claimsIndex).toBeGreaterThan(-1);
    expect(batchIndex).toBeGreaterThan(claimsIndex);
    expect(commitIndex).toBeGreaterThan(batchIndex);
    expect(userService.slice(claimsIndex, batchIndex)).toContain('tenantId: invitation.tenantId');
    expect(userService.slice(claimsIndex, batchIndex)).toContain('role: invitationRole');
  });

  it('never allows an invitation to mint super_admin', () => {
    expect(userService).toContain("normalizedRole === 'super_admin'");
    expect(userService).toContain("invitationRole === 'super_admin'");
  });
});

describe('PR4 alternate provisioning surfaces inherit the same tenant policy', () => {
  const legacyCreate = read(LEGACY_CREATE);
  const ssoOauth = read(SSO_OAUTH);
  const hrCreate = read(HR_CREATE);

  it('hardens the legacy tenant create-user endpoint instead of allowing platform role minting', () => {
    expect(legacyCreate).toContain('validateRequest(createUserSchema');
    expect(legacyCreate).toContain('initialPasswordSchema.parse');
    expect(legacyCreate).toContain("targetRole === 'super_admin'");
    expect(legacyCreate).toContain('resolveTenantRoles(tenantDoc.data()?.rolesEnabled)');
    expect(legacyCreate).toContain('await syncUserClaims({');
    expect(legacyCreate).toContain('await adminAuth.deleteUser(userRecord.uid).catch(() => {});');
  });

  it('forces SSO auto-provisioning through role enablement, seat limits, and Auth claims', () => {
    const roleCheck = ssoOauth.indexOf('resolveTenantRoles(tenantSnap.data()?.rolesEnabled)');
    // The point-in-time checkUserLimit read was replaced by an atomic reservation held
    // across provisioning. An identity-provider callback is unauthenticated and can
    // arrive many times at once, so this is the seat path most exposed to concurrency.
    const seatCheck = ssoOauth.indexOf(
      "reserveStaffSeat(tenantId, targetRole, 'sso_auto_provision')",
    );
    const createAuth = ssoOauth.indexOf('await adminAuth.createUser({', seatCheck);
    const claimSync = ssoOauth.indexOf('await syncUserClaims({', createAuth);
    const userWrite = ssoOauth.indexOf(
      "adminDb.collection('users').doc(userRecord.uid).set",
      claimSync,
    );

    expect(roleCheck).toBeGreaterThan(-1);
    expect(seatCheck).toBeGreaterThan(roleCheck);
    expect(createAuth).toBeGreaterThan(seatCheck);
    expect(claimSync).toBeGreaterThan(createAuth);
    expect(userWrite).toBeGreaterThan(claimSync);
    expect(ssoOauth).toContain('endSessions: false');
    expect(ssoOauth).toContain('await adminAuth.deleteUser(userRecord.uid).catch(() => {});');
    expect(ssoOauth).toContain('releaseStaffSeat(seat)');
  });

  it('refuses SSO sign-in for an identity whose access has been revoked', () => {
    // SSO authenticates INTO an existing identity, so it inherits that identity's
    // access state. Without this, a deactivated / suspended / terminated / soft-deleted
    // user whose Firebase Auth record was never disabled — legacy records predate the
    // Auth+Firestore sync, and any single-plane write can drift — could sign in through
    // the identity provider and be handed a custom token, walking straight around the
    // deactivation the workspace performed.
    const resolver = ssoOauth.slice(ssoOauth.indexOf('async function resolveOrProvisionUser'));
    const accessCheck = resolver.indexOf('isUserAccessDisabled(match.data)');
    const returnUid = resolver.indexOf('return match.uid;');

    expect(accessCheck).toBeGreaterThan(-1);
    expect(returnUid).toBeGreaterThan(accessCheck);
    expect(resolver).toContain('This account is not active.');
  });

  it('still refuses an email that belongs to a different tenant', () => {
    const resolver = ssoOauth.slice(ssoOauth.indexOf('async function resolveOrProvisionUser'));
    expect(resolver).toContain('existsInAnotherTenant');
    expect(resolver).toContain('User belongs to a different tenant.');
    // The tenant-scoped lookup must not become a way to skip the cross-tenant refusal:
    // a match is only accepted when it carries the signing-in tenant.
    expect(ssoOauth).toContain("where('tenantId', '==', tenantId)");
  });

  it('does not let the HR employee UI mint login identities without Admin authority', () => {
    expect(hrCreate).toContain('const requesterRole = normalizeRole(access.user.role);');
    expect(hrCreate).toContain('if (!isAdminLike(requesterRole))');
    expect(hrCreate).toContain('Only Admin or Super Admin can create user accounts.');
    expect(hrCreate).toContain('await syncUserClaims({');
    expect(hrCreate).toContain("status: 'active'");
    expect(hrCreate).toContain('isActive: true');
  });
});

describe('PR4 user lifecycle uses one authorization and identity path', () => {
  const legacyUpdate = read(LEGACY_UPDATE);
  const adminUpdate = read(ADMIN_UPDATE);
  const hrUpdate = read(HR_UPDATE);
  const hrDelete = read(HR_DELETE);
  const accessState = read(ACCESS_STATE);

  it('delegates the legacy uid update route to the canonical admin update handler', () => {
    expect(legacyUpdate).toContain("import { POST as updateUser } from '../../update/route';");
    expect(legacyUpdate).toContain('return updateUser(canonicalRequest);');
    expect(legacyUpdate).not.toContain('adminDb.collection');
    expect(legacyUpdate).not.toContain('setCustomUserClaims');
  });

  it('forces admin role changes through tenant role policy and claim/session sync', () => {
    expect(adminUpdate).toContain('resolveTenantRoles(tenantSnap.data()?.rolesEnabled)');
    expect(adminUpdate).toContain('isRoleEnabled(rolesEnabled, role)');
    expect(adminUpdate).toContain('await syncUserClaims({');
    expect(adminUpdate).toContain('endSessions: true');
  });

  it('forces HR-surface role changes through the same policy and claim/session sync', () => {
    expect(hrUpdate).toContain('ERP_ROLES as readonly string[]).includes(requestedRole)');
    expect(hrUpdate).toContain('Permission.ManageRoles');
    expect(hrUpdate).toContain('resolveTenantRoles(tenantSnap.data()?.rolesEnabled)');
    expect(hrUpdate).toContain('await syncUserClaims({');
    expect(hrUpdate).toContain('endSessions: true');
  });

  it('keeps profile editing separate from account disable/reactivation', () => {
    expect(adminUpdate).toContain(
      'Account status cannot be changed from the profile update endpoint.',
    );
    expect(hrUpdate).toContain('Account status cannot be changed from the employee profile.');
    expect(adminUpdate).not.toContain('syncFirebaseUserAccessState');
    expect(hrUpdate).not.toContain('syncFirebaseUserAccessState');
  });

  it('keeps reporting-manager relationships tenant-local even for Super Admin', () => {
    expect(adminUpdate).toContain(
      "const tenantMatch = String(managerData.tenantId || '') === targetTenantId;",
    );
    expect(adminUpdate).toContain('managerTenantId !== targetTenantId');
    expect(adminUpdate).not.toContain('const tenantMatch = isSuperAdminRequester');
  });

  it('terminates an identity fail-closed and protects privileged accounts', () => {
    const disableAt = hrDelete.indexOf('await syncFirebaseUserAccessState({');
    const firestoreAt = hrDelete.indexOf(
      "await adminDb.collection('users').doc(uid).set",
      disableAt,
    );

    expect(hrDelete).toContain("status: 'terminated'");
    expect(hrDelete).toContain('isDeleted: true');
    expect(hrDelete).toContain('isActive: false');
    expect(hrDelete).toContain("requesterRole !== 'super_admin' && targetRole === 'super_admin'");
    expect(hrDelete).toContain("requesterRole === 'hr' && targetRole === 'admin'");
    expect(hrDelete).toContain('You cannot terminate your own account.');
    expect(disableAt).toBeGreaterThan(-1);
    expect(firestoreAt).toBeGreaterThan(disableAt);
  });

  it('revokes live sessions whenever access is disabled', () => {
    expect(accessState).toContain("'terminated'");
    expect(accessState).toContain("'disabled'");
    expect(accessState).toContain('input.isDeleted === true');
    expect(accessState).toContain('input.isActive === false');
    expect(accessState).toContain('await adminAuth.revokeRefreshTokens(params.uid);');
  });
});

describe('PR4 plan and seat enforcement', () => {
  const userLimit = read(USER_LIMIT);
  const planRoute = read(PLAN_ROUTE);

  it('does not count inactive/deleted identities as paid staff seats', () => {
    expect(userLimit).toContain('if (isUserAccessDisabled(data)) continue;');
  });

  it('does not silently normalize an invalid operator plan into a valid tier', () => {
    expect(planRoute).toContain('PURCHASABLE_PLAN_KEYS');
    expect(planRoute).toContain(
      'const requestedPlan = planProvided ? parsePlan(body?.plan) : null;',
    );
    expect(planRoute).toContain('Trial is a subscription state, not a plan tier.');
  });

  it('requires module override values to be real booleans on known module keys', () => {
    expect(planRoute).toContain('VALID_MODULE_KEYS.has(key)');
    expect(planRoute).toContain("typeof value !== 'boolean'");
    expect(planRoute).toContain('Invalid module key:');
  });

  it('rejects unknown billing modes instead of silently treating them as Stripe', () => {
    expect(planRoute).toContain('BILLING_MODES as readonly string[]).includes(rawBillingMode)');
    expect(planRoute).toContain('billingMode must be one of:');
  });
});

describe('PR4 certification — staff seats are consumed atomically', () => {
  const seatReservation = read('lib/billing/seat-reservation.ts');
  const superAdminUpdate = read('app/api/super_admin/users/[uid]/route.ts');
  const userService = read(USER_SERVICE);

  it('serializes reservations on a per-tenant ledger document inside a transaction', () => {
    // The ledger document is the whole point: it is READ and WRITTEN by every granted
    // reservation, which is what makes two concurrent transactions conflict instead of
    // both observing the same free seat. Behavioural proof (real Firestore emulator,
    // genuinely concurrent requests) lives in
    // __tests__/integration/staff-seat-concurrency.emulator.test.ts.
    expect(seatReservation).toContain('adminDb.runTransaction(');
    const body = seatReservation.slice(seatReservation.indexOf('adminDb.runTransaction('));
    expect(body).toContain('await tx.get(ledgerRef)');
    expect(body).toContain('tx.set(\n      ledgerRef,');
    expect(body).toContain('reservationSeq');
  });

  it('reuses the canonical seat accounting rather than re-implementing it', () => {
    expect(seatReservation).toContain('countBillableSeats(usersSnap, invitesSnap, now)');
    expect(seatReservation).toContain('resolveSeatEnforcementPlan(');
    expect(seatReservation).toContain('staffSeatSources(id)');
  });

  it('does not hold a seat for client identities or unlimited plans', () => {
    expect(seatReservation).toContain("if (role === 'client' || limit < 0)");
    expect(seatReservation).toContain('reservationId: null');
  });

  it('expires an abandoned reservation so a crashed instance cannot leak a seat', () => {
    expect(seatReservation).toContain('SEAT_RESERVATION_TTL_MS');
    expect(seatReservation).toContain('expiresAt <= now');
    expect(seatReservation).toContain('tx.delete(doc.ref)');
  });

  it('uses no in-memory lock or timing hack, which serverless instances cannot share', () => {
    expect(seatReservation).not.toMatch(/setTimeout|Mutex|globalThis\.__/);
  });

  it('does not double-reserve the seat an accepted invitation already holds', () => {
    const accept = userService.slice(userService.indexOf('static async acceptInvitation'));
    expect(accept).not.toContain('reserveStaffSeat');
    expect(accept).toContain('Acceptance takes NO seat reservation on purpose.');
  });

  it('re-enabling a disabled identity is measured against the plan, like reactivation', () => {
    // Disabled identities are excluded from the seat count, so flipping one back to
    // active restores billable capacity. Without a check here a Super Admin could step
    // around app/api/users/[id]/reactivate's seat gate on a tenant already at its cap.
    expect(superAdminUpdate).toContain('isUserAccessDisabled(existing)');
    expect(superAdminUpdate).toContain('restoresAccess');
    expect(superAdminUpdate).toContain("'reactivation'");
    expect(superAdminUpdate).toContain('planLimitResponseBody(seat)');
  });

  it('still refuses to restore a deleted identity outside the reactivation flow', () => {
    expect(superAdminUpdate).toContain(
      'A deleted user must be restored through the reactivation flow.',
    );
  });
});

describe('PR4 certification — provisioning failures never strand an identity', () => {
  it.each([
    ['app/api/admin/users/create/route.ts'],
    ['app/api/create-user/route.ts'],
    ['app/api/hr/employees/create/route.ts'],
    ['app/api/super_admin/users/route.ts'],
    ['lib/auth/sso-oauth.ts'],
  ])('%s deletes the Auth identity when the claim or Firestore write fails', (file) => {
    const src = read(file);
    expect(src).toMatch(
      /adminAuth\.deleteUser\((authUser|userRecord)\.uid\)\.catch\(\(\) => \{\}\)/,
    );
  });
});
