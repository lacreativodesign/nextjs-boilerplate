import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';

const addressSchema = z.object({
  street: z.string().trim().min(1, 'Street cannot be empty').optional(),
  city: z.string().trim().min(1, 'City cannot be empty').optional(),
  state: z.string().trim().min(1, 'State cannot be empty').optional(),
  zip: z.string().trim().min(1, 'Zip cannot be empty').optional(),
  country: z.string().trim().min(1, 'Country cannot be empty').optional(),
});

export const createClientSchema = z.object({
  companyName: z
    .string({ required_error: 'Company name is required' })
    .trim()
    .min(2, 'Company name must be at least 2 characters')
    .max(200, 'Company name must be at most 200 characters'),
  contactName: z
    .string({ required_error: 'Contact name is required' })
    .trim()
    .min(2, 'Contact name must be at least 2 characters')
    .max(100, 'Contact name must be at most 100 characters'),
  email: emailSchema,
  phone: phoneSchema.optional(),
  address: addressSchema.optional(),
  industry: z.string().trim().min(1, 'Industry cannot be empty').optional(),
  website: z.string().trim().url('Website must be a valid URL').optional(),
  tenantId: z
    .string({ required_error: 'Tenant id is required' })
    .trim()
    .min(1, 'Tenant id is required'),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
