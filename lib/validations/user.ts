import { z } from 'zod';
import { ERP_ROLES } from '@/lib/erpAccess';
import { emailSchema, phoneSchema } from './common';

// Users must always include role + tenant context.
const roleSchema = z.enum(ERP_ROLES, {
  required_error: 'Role is required',
  invalid_type_error: 'Role is required',
});

export const createUserSchema = z.object({
  email: emailSchema,
  displayName: z
    .string({ required_error: 'Display name is required' })
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must be at most 100 characters'),
  role: roleSchema,
  tenantId: z
    .string({ required_error: 'Tenant id is required' })
    .trim()
    .min(1, 'Tenant id is required'),
  phone: phoneSchema.optional(),
  department: z.string().trim().min(1, 'Department cannot be empty').optional(),
  managerId: z.string().trim().optional(),
});

export const updateUserSchema = createUserSchema.partial();

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required' })
      .min(8, 'Current password must be at least 8 characters'),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'New password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/,
        'New password must include uppercase, lowercase, number, and special character',
      ),
    confirmPassword: z
      .string({ required_error: 'Please confirm your new password' })
      .min(8, 'Confirm password must be at least 8 characters'),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm password must match the new password',
        path: ['confirmPassword'],
      });
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
