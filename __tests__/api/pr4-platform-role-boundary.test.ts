import fs from 'fs';
import path from 'path';
import { createUserSchema, platformCreateUserSchema } from '@/lib/validations/user';
import { INTERNAL_ROLE_OPTIONS, USER_ROLE_VALUES } from '@/lib/userOptions';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const baseUser = {
  email: 'operator@example.com',
  displayName: 'Platform Operator',
  tenantId: 'tenant-a',
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

  it('allows super_admin only through the explicit platform creation schema', () => {
    expect(platformCreateUserSchema.parse({ ...baseUser, role: 'super_admin' }).role).toBe(
      'super_admin',
    );
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
