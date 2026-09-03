import fs from 'fs';
import path from 'path';
import { changePasswordSchema } from '@/lib/validations/user';
import { adminCreateUserProfileSchema, deleteUserSchema } from '@/lib/validations/user-admin';

/**
 * SOC2 F-06 — the tail of the admin user-creation payload.
 *
 * `admin/users/create` already called `validateRequest(createUserSchema, ...)` — for
 * seven fields. Nine more were destructured straight off the raw body and written to
 * Firestore. Partial validation is more dangerous than none, because the route reads
 * as though its input is checked.
 *
 * The password case is the one worth stating plainly. A user changing their OWN
 * password had to satisfy `changePasswordSchema`: eight characters, upper, lower,
 * digit, symbol. An admin creating an account faced no policy beyond Firebase's
 * six-character floor, so the weakest credentials in the system were the ones handed
 * out by administrators. The two paths now share one policy.
 */

describe('initial password policy', () => {
  const base = {};

  it('accepts a password that satisfies the policy', () => {
    expect(() =>
      adminCreateUserProfileSchema.parse({ ...base, password: 'Str0ng!Pass' }),
    ).not.toThrow();
  });

  it('rejects a weak password an admin could previously set', () => {
    // Firebase's own floor is six characters, so all of these were accepted.
    for (const password of ['abc123', 'password', 'PASSWORD1', 'Sh0rt!']) {
      expect(() => adminCreateUserProfileSchema.parse({ ...base, password })).toThrow();
    }
  });

  it('applies the same rule the self-service path already enforced', () => {
    const weak = 'abc12345';
    // Self-service rejects it...
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'Str0ng!Pass',
        newPassword: weak,
        confirmPassword: weak,
      }),
    ).toThrow();
    // ...so admin-created accounts must reject it too.
    expect(() => adminCreateUserProfileSchema.parse({ password: weak })).toThrow();
  });

  it('still allows the field to be omitted, which yields a random credential', () => {
    expect(() => adminCreateUserProfileSchema.parse({})).not.toThrow();
  });
});

describe('adminCreateUserProfileSchema', () => {
  it('accepts the payload the create form actually sends', () => {
    // The form runs values through toNum() before posting, so these arrive as numbers.
    const parsed = adminCreateUserProfileSchema.parse({
      designation: 'Account Manager',
      salary: 250000,
      monthlyTarget: 12000,
      commission: 5,
      joiningDate: '2026-01-15',
      cnic: '00000-0000000-0',
      dob: '1995-04-02',
      status: 'active',
    });
    expect(parsed.commission).toBe(5);
    expect(parsed.status).toBe('active');
  });

  it('accepts nulls for the optional numeric fields, as the form sends when blank', () => {
    expect(() =>
      adminCreateUserProfileSchema.parse({ salary: null, monthlyTarget: null, commission: null }),
    ).not.toThrow();
  });

  it('rejects a non-numeric salary that would surface later as a reporting bug', () => {
    expect(() => adminCreateUserProfileSchema.parse({ salary: '250000' })).toThrow();
    expect(() => adminCreateUserProfileSchema.parse({ salary: { amount: 1 } })).toThrow();
    expect(() => adminCreateUserProfileSchema.parse({ monthlyTarget: [1, 2] })).toThrow();
  });

  it('bounds commission to a percentage, which is how the UI renders it', () => {
    expect(() => adminCreateUserProfileSchema.parse({ commission: 101 })).toThrow();
    expect(() => adminCreateUserProfileSchema.parse({ commission: -1 })).toThrow();
    expect(() => adminCreateUserProfileSchema.parse({ commission: 100 })).not.toThrow();
  });

  it('rejects a negative salary', () => {
    expect(() => adminCreateUserProfileSchema.parse({ salary: -1 })).toThrow();
  });

  it('constrains status to the two values the UI offers', () => {
    // `disabled: status === 'disabled'` decides whether the Auth account is enabled.
    // Anything else silently produced an ENABLED account with a nonsense status.
    expect(() => adminCreateUserProfileSchema.parse({ status: 'suspended' })).toThrow();
    expect(() => adminCreateUserProfileSchema.parse({ status: 'Disabled' })).toThrow();
    expect(() => adminCreateUserProfileSchema.parse({ status: 'disabled' })).not.toThrow();
  });

  it('passes through the fields createUserSchema already covers', () => {
    // This schema validates a SUBSET of the body, so it must not reject the rest.
    expect(() =>
      adminCreateUserProfileSchema.parse({
        email: 'a@example.com',
        role: 'sales',
        status: 'active',
      }),
    ).not.toThrow();
  });
});

describe('deleteUserSchema', () => {
  it('requires a non-empty uid', () => {
    expect(() => deleteUserSchema.parse({})).toThrow();
    expect(() => deleteUserSchema.parse({ uid: '   ' })).toThrow();
  });

  it('rejects a non-string uid that the truthiness check used to accept', () => {
    // `if (!uid)` passed anything non-empty, including an object, which then reached
    // adminAuth.deleteUser and a Firestore document path.
    expect(() => deleteUserSchema.parse({ uid: { $ne: null } })).toThrow();
    expect(() => deleteUserSchema.parse({ uid: ['a'] })).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => deleteUserSchema.parse({ uid: 'user_1', tenantId: 'other' })).toThrow();
  });
});

const MUST_VALIDATE = [
  'app/api/admin/users/create/route.ts',
  'app/api/admin/users/delete/route.ts',
];

describe('admin user routes validate their bodies', () => {
  it.each(MUST_VALIDATE)('%s validates its request body', (rel) => {
    expect(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')).toContain('validateRequest(');
  });

  it('create no longer destructures the profile tail off the raw body', () => {
    const source = fs.readFileSync(path.join(process.cwd(), MUST_VALIDATE[0]), 'utf8');
    expect(source).toContain('adminCreateUserProfileSchema');
    expect(source).not.toMatch(/}\s*=\s*body \|\| \{\};/);
  });
});
