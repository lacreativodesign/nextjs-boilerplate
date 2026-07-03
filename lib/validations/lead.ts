import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().min(0, 'Value must be at least 0'),
);

export const createLeadSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(2, 'Title must be at least 2 characters')
    .max(200, 'Title must be at most 200 characters'),
  contactName: z
    .string({ required_error: 'Contact name is required' })
    .trim()
    .min(2, 'Contact name must be at least 2 characters')
    .max(100, 'Contact name must be at most 100 characters'),
  email: emailSchema,
  phone: phoneSchema.optional(),
  company: z
    .string()
    .trim()
    .min(2, 'Company must be at least 2 characters')
    .max(200, 'Company must be at most 200 characters')
    .optional(),
  source: z.enum(['website', 'referral', 'cold_call', 'social_media', 'advertisement', 'other'], {
    required_error: 'Lead source is required',
  }),
  status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'], {
    required_error: 'Lead status is required',
  }),
  value: optionalNumber.optional(),
  assignedTo: z.string().trim().min(1, 'Assigned user is required').optional(),
  notes: z.string().trim().max(5000, 'Notes must be at most 5000 characters').optional(),
  tenantId: z
    .string({ required_error: 'Tenant id is required' })
    .trim()
    .min(1, 'Tenant id is required'),
});

export const updateLeadSchema = createLeadSchema.partial();

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
