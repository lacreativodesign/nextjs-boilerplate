import { z } from 'zod';
import { ERP_ROLES } from '@/lib/erpAccess';

/**
 * SOC2 F-06: the tail of the admin user-creation payload.
 *
 * `app/api/admin/users/create` already calls `validateRequest(createUserSchema, ...)`,
 * but only for seven fields — email, displayName, role, tenantId, phone, department
 * and managerId. Everything else was destructured straight off the raw body and
 * written to Firestore. That is more dangerous than no validation at all, because the
 * route reads as though its input is checked.
 *
 * What escaped, and why each matters:
 *
 *   password — used verbatim as the initial credential. `changePasswordSchema` makes
 *     a user changing their OWN password meet a real policy: eight characters with
 *     upper, lower, digit and symbol. An admin creating an account faced no policy at
 *     all beyond Firebase's six-character floor, so the weakest credentials in the
 *     system were the ones handed out by administrators. The same policy is applied
 *     here. Omitting the field is still fine and still yields a random 32-hex
 *     credential the admin never sees.
 *
 *   salary, monthlyTarget, commission — stored with `?? null` at any type. A string,
 *     an object or an array would persist unchallenged and surface later in finance
 *     and HR reporting, where the failure looks like a reporting bug rather than an
 *     input one. `commission` is rendered as a percentage in the admin UI, so it is
 *     bounded to 0–100 rather than left as an unbounded number.
 *
 *   status — decides `disabled: status === 'disabled'` on the Firebase Auth record.
 *     The UI offers exactly two values; anything else silently produced an ENABLED
 *     account with a nonsense status string on the profile.
 *
 * Dates and identity strings are bounded in length but not parsed here: they flow
 * through the same normalizers the update route already applies, and tightening their
 * format is a separate change with its own migration question for existing rows.
 */

export const USER_STATUSES = ['active', 'disabled'] as const;

/** Mirrors changePasswordSchema so both paths enforce one policy. */
export const initialPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/,
    'Password must include uppercase, lowercase, number, and special character',
  );

export const adminCreateUserProfileSchema = z
  .object({
    // Optional: when absent the route generates a random credential instead.
    password: initialPasswordSchema.optional(),
    designation: z.string().trim().max(120).optional(),
    salary: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
    monthlyTarget: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
    commission: z.number().finite().min(0).max(100).nullable().optional(),
    joiningDate: z.string().trim().max(40).nullable().optional(),
    cnic: z.string().trim().max(40).optional(),
    dob: z.string().trim().max(40).nullable().optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  // Not `.strict()`: this schema validates a SUBSET of the body, and the fields
  // createUserSchema already covers are still present alongside it.
  .passthrough();

/**
 * SOC2 F-06: the tenant-admin user-update payload.
 *
 * `role` was the gap that mattered. The route lowercased whatever string arrived and
 * wrote it to `users/{uid}.role`, with no check against the canonical role list. The
 * surrounding guards establish ManageRoles and tenant ownership, but they must not
 * turn a tenant-scoped route into a platform-role provisioning surface. `super_admin`
 * is therefore rejected here even when the actor is a platform Super Admin; promotion
 * to that platform role belongs exclusively to `/api/super_admin/users/[uid]`.
 *
 * `status` and the numeric fields are bounded to match `adminCreateUserProfileSchema`.
 * Before this, commission was capped at 100 on create and unbounded on update, so the
 * same value could be rejected when creating a user and accepted when editing one.
 *
 * Named `adminUpdateUserSchema` rather than `updateUserSchema`: lib/validations/user.ts
 * already exports the latter as `createUserSchema.partial()`, and two schemas with one
 * name invite the wrong import.
 */
export const adminUpdateUserSchema = z
  .object({
    uid: z.string().trim().min(1, 'uid is required').max(128),
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: z.string().trim().email().max(320).optional(),
    // INTERNAL_ROLE_OPTIONS excludes the platform-only super_admin role. The API
    // enforces the same boundary so a crafted request cannot bypass the UI.
    role: z
      .enum(ERP_ROLES)
      .refine((role) => role !== 'super_admin', {
        message: 'super_admin must be managed through the platform administration surface',
      })
      .optional(),
    department: z.string().trim().max(64).optional(),
    managerId: z.string().trim().max(128).optional(),
    phone: z.string().trim().max(40).optional(),
    cnic: z.string().trim().max(40).optional(),
    designation: z.string().trim().max(120).optional(),
    dob: z.string().trim().max(40).nullable().optional(),
    joiningDate: z.string().trim().max(40).nullable().optional(),
    salary: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
    monthlyTarget: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
    commission: z.number().finite().min(0).max(100).nullable().optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict();

export const deleteUserSchema = z
  .object({
    uid: z.string().trim().min(1, 'uid is required').max(128),
  })
  .strict();

export type AdminCreateUserProfileInput = z.infer<typeof adminCreateUserProfileSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
