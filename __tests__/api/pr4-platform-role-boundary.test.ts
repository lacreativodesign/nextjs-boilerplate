import fs from 'fs';
import path from 'path';
import { createUserSchema, platformCreateUserSchema } from '@/lib/validations/user';
import { adminUpdateUserSchema } from '@/lib/validations/user-admin';
import { INTERNAL_ROLE_OPTIONS, USER_ROLE_VALUES } from '@/lib/userOptions';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const baseUser = {
  email: 'operator@example.com',
  displayName: 'Platform Operator',
  tenantId: 'tenant-a',
};

const baseUpdate = {
  uid: 'user-1',
  name: 'Tenant User',
  department: 'admin',
};

describe('PR4 platform-role provisioning boundary', () => {
  it('keeps super_admin in the canonical global role vocabulary but out of tenant staff options', () => {
    expect(USER_ROLE_VALUES).toContain('super_admin');
    expect(INTERNAL_ROLE_OPTIONS).not.toContain('super_admin');
  });

  it('rejects super_admin through the canonical tenant-scoped creation schema', () => {
    expect(() => createUserSchema.parse({ ...baseUser, role: 'super_admin' })).toThrow(
      /platform administration surface/i,
    );
    expect(createUserSchema.parse({ ...baseUser, role: 'admin' }).role).toBe('admin');
  });

  it('rejects super_admin promotion through the tenant-admin update schema', () => {
    expect(() => adminUpdateUserSchema.parse({ ...baseUpdate, role: 'super_admin' })).toThrow(
      /platform administration surface/i,
    );
    expect(adminUpdateUserSchema.parse({ ...baseUpdate, role: 'admin' }).role).toBe('admin');
  });

  it('allows super_admin only through the explicit platform creation schema', () => {
    expect(platformCreateUserSchema.parse({ ...baseUser, role: 'super_admin' }).role).toBe(
      'super_admin',
    );
  });

  it('refuses a submitted super_admin on the tenant HR employee-update surface', () => {
    const hrUpdate = read('app/api/hr/employees/update/route.ts');

    // Refused for EVERY actor, not only a non-super_admin one. The previous guard read
    // `requesterRole !== 'super_admin' && requestedRole === 'super_admin'`, which turned
    // a tenant HR profile route into a platform-role minting surface for the one actor
    // that could reach it.
    expect(hrUpdate).toContain("normalizeRole(body?.role || '') === 'super_admin'");
    expect(hrUpdate).toContain('platform administration surface');
    expect(hrUpdate).not.toContain(
      "requesterRole !== 'super_admin' && requestedRole === 'super_admin'",
    );

    // With the platform role refused outright, a role CHANGE here is always a tenant
    // role, so the workspace allow-list no longer has a super_admin escape hatch.
    expect(hrUpdate).not.toContain("if (requestedRole !== 'super_admin') {");
  });

  it('keeps one canonical employee-update implementation behind the legacy admin path', () => {
    const legacyHrUpdate = read('app/api/admin/hr/employees/update/route.ts');

    // The duplicate copy wrote users/{uid}.role straight from the body with no canonical
    // role check, no ManageRoles assertion, no rolesEnabled allow-list, no atomic seat
    // reservation and no claim sync — so an HR actor could promote itself to admin — and
    // wrote `status` directly, stepping around the deactivate/reactivate seat and Auth
    // gates. It must stay a thin adapter onto the guarded handler.
    expect(legacyHrUpdate).toContain(
      "import { POST as updateEmployee } from '../../../../hr/employees/update/route';",
    );
    expect(legacyHrUpdate).toContain('return updateEmployee(req);');
    expect(legacyHrUpdate).not.toContain("adminDb.collection('users')");
    expect(legacyHrUpdate).not.toContain('role: requestedRole');
  });

  it('keeps employee access-state changes on the dedicated IAM endpoints', () => {
    const adminHrPage = read('app/admin/hr/employees/page.tsx');

    expect(adminHrPage).not.toContain(
      'body: JSON.stringify({ uid: getRowId(selectedUser), status })',
    );
    expect(adminHrPage).toContain("/reactivate`, { method: 'POST' }");
    expect(adminHrPage).toContain("`, { method: 'DELETE' }");
  });

  it('keeps tenant creation surfaces on createUserSchema and platform creation on platformCreateUserSchema', () => {
    const adminCreate = read('app/api/admin/users/create/route.ts');
    const legacyCreate = read('app/api/create-user/route.ts');
    const hrCreate = read('app/api/hr/employees/create/route.ts');
    const platformCreate = read('app/api/super_admin/users/route.ts');

    expect(adminCreate).toContain('validateRequest(createUserSchema');
    expect(legacyCreate).toContain('validateRequest(createUserSchema');
    expect(hrCreate).toContain('validateRequest(createUserSchema');
    expect(platformCreate).toContain('validateRequest(platformCreateUserSchema');
    expect(platformCreate).not.toContain('validateRequest(createUserSchema');
  });
});
