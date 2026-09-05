import fs from 'fs';
import path from 'path';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const INVITE_ROUTE = 'app/api/users/invite/route.ts';
const USER_SERVICE = 'lib/users/user-service.ts';
const LEGACY_UPDATE = 'app/api/admin/users/[uid]/update/route.ts';
const ADMIN_UPDATE = 'app/api/admin/users/update/route.ts';
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

  it('terminates an HR identity in Firebase as well as Firestore', () => {
    expect(hrDelete).toContain("status: 'terminated'");
    expect(hrDelete).toContain('isDeleted: true');
    expect(hrDelete).toContain('isActive: false');
    expect(hrDelete).toContain('await syncFirebaseUserAccessState({');
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
