import fs from 'fs';
import path from 'path';
import { ERP_ROLES } from '@/lib/erpAccess';
import { INTERNAL_ROLE_OPTIONS } from '@/lib/userOptions';
import { adminUpdateUserSchema } from '@/lib/validations/user-admin';

/**
 * SOC2 F-06 — the admin user-update payload.
 *
 * `role` was the gap that mattered. The route lowercased whatever string arrived and
 * wrote it to `users/{uid}.role`, with no check against the canonical role list.
 *
 * The surrounding guards are sound: changing a role requires ManageRoles, only a
 * super_admin may touch or grant super_admin, and the target's tenant is verified.
 * None of them establishes that the value is a role the system RECOGNISES.
 * `getCurrentUserOrThrow` reads the role from the Firestore document and fails closed
 * only on an EMPTY role, so a user carrying `role: 'wizard'` would still
 * authenticate, satisfy no permission check, and land in a state no screen can
 * recover from. This is not privilege escalation — an unknown role grants nothing —
 * it is a lockout, and the role field is the single most important field on a user.
 */

const base = { uid: 'user_1', name: 'Ayesha M.' };

describe('role is constrained to the canonical list', () => {
  it.each(ERP_ROLES)('accepts the real role %s', (role) => {
    expect(() => adminUpdateUserSchema.parse({ ...base, role })).not.toThrow();
  });

  it('rejects a role the system does not recognise', () => {
    for (const role of ['wizard', 'owner', 'root', 'Admin', 'super-admin', '']) {
      expect(() => adminUpdateUserSchema.parse({ ...base, role })).toThrow();
    }
  });

  it('accepts every role the edit form can actually submit', () => {
    // The select is populated from INTERNAL_ROLE_OPTIONS. If that list ever gains a
    // value outside ERP_ROLES, this fails here rather than in production.
    for (const role of INTERNAL_ROLE_OPTIONS) {
      expect(ERP_ROLES).toContain(role);
      expect(() => adminUpdateUserSchema.parse({ ...base, role })).not.toThrow();
    }
  });

  it('leaves role optional so a profile edit does not have to restate it', () => {
    expect(() => adminUpdateUserSchema.parse(base)).not.toThrow();
  });
});

describe('adminUpdateUserSchema', () => {
  it('accepts the payload the edit form actually sends', () => {
    // toNum() returns 0 for a blank input rather than null, so 0 must be valid.
    const parsed = adminUpdateUserSchema.parse({
      ...base,
      email: 'ayesha@example.com',
      phone: '03001234567',
      cnic: '00000-0000000-0',
      dob: '1995-04-02',
      status: 'active',
      role: 'sales',
      department: 'sales',
      designation: 'Account Manager',
      joiningDate: '2026-01-15',
      salary: 0,
      monthlyTarget: 0,
      commission: 0,
    });
    expect(parsed.salary).toBe(0);
    expect(parsed.role).toBe('sales');
  });

  it('requires uid and name, as the route already did', () => {
    expect(() => adminUpdateUserSchema.parse({ name: 'A' })).toThrow();
    expect(() => adminUpdateUserSchema.parse({ uid: 'user_1' })).toThrow();
    expect(() => adminUpdateUserSchema.parse({ uid: 'user_1', name: '  ' })).toThrow();
  });

  it('rejects a non-string uid the old truthiness check would have accepted', () => {
    expect(() => adminUpdateUserSchema.parse({ ...base, uid: { $ne: null } })).toThrow();
  });

  it('bounds commission the same way creation does', () => {
    // Before this, commission was capped at 100 on create and unbounded on update,
    // so one value was rejected creating a user and accepted editing the same user.
    expect(() => adminUpdateUserSchema.parse({ ...base, commission: 500 })).toThrow();
    expect(() => adminUpdateUserSchema.parse({ ...base, commission: 100 })).not.toThrow();
  });

  it('rejects a non-numeric salary that normalizeNumber would have coerced', () => {
    // `Number('250000')` is finite, so a string silently became a number on write.
    expect(() => adminUpdateUserSchema.parse({ ...base, salary: '250000' })).toThrow();
    expect(() => adminUpdateUserSchema.parse({ ...base, salary: -1 })).toThrow();
  });

  it('constrains status to the two values the UI offers', () => {
    expect(() => adminUpdateUserSchema.parse({ ...base, status: 'suspended' })).toThrow();
    expect(() => adminUpdateUserSchema.parse({ ...base, status: 'disabled' })).not.toThrow();
  });

  it('rejects unknown keys rather than letting them reach the update payload', () => {
    expect(() => adminUpdateUserSchema.parse({ ...base, tenantId: 'other-tenant' })).toThrow();
    expect(() => adminUpdateUserSchema.parse({ ...base, uidToImpersonate: 'x' })).toThrow();
  });
});

describe('the update route uses it', () => {
  const rel = 'app/api/admin/users/update/route.ts';

  it('validates its request body', () => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(source).toContain('validateRequest(adminUpdateUserSchema');
  });

  it('no longer coerces required fields off a raw body', () => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(source).not.toContain("const uid = String(body?.uid || '').trim();");
    expect(source).not.toContain("const name = String(body?.name || '').trim();");
  });
});
