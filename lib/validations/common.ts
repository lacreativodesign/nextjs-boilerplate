import { z } from 'zod';

// Shared validation helpers for consistent, user-friendly messages.
export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .email('Email must be a valid email address');

// International phone format (E.164-ish, allows leading +, 7-15 digits).
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, 'Phone must be a valid international number');

const dateStringSchema = z
  .string({ required_error: 'Date is required' })
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date format');

export const paginationSchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .default(20),
  sortBy: z.string().trim().min(1, 'Sort by cannot be empty').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const searchSchema = z.object({
  query: z
    .string({ required_error: 'Search query is required' })
    .trim()
    .min(1, 'Search query is required')
    .max(200, 'Search query must be at most 200 characters'),
  filters: z.record(z.unknown()).optional(),
});

export const dateRangeSchema = z
  .object({
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
  .refine((data) => new Date(data.endDate).getTime() > new Date(data.startDate).getTime(), {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export const idSchema = z.object({
  id: z.string({ required_error: 'Id is required' }).trim().min(1, 'Id is required'),
});

export const tenantIdSchema = z.object({
  tenantId: z
    .string({ required_error: 'Tenant id is required' })
    .trim()
    .min(1, 'Tenant id is required'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type IdInput = z.infer<typeof idSchema>;
export type TenantIdInput = z.infer<typeof tenantIdSchema>;
export type EmailInput = z.infer<typeof emailSchema>;
export type PhoneInput = z.infer<typeof phoneSchema>;
export type DateStringInput = z.infer<typeof dateStringSchema>;

export { dateStringSchema };
