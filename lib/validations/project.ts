import { z } from 'zod';
import { dateStringSchema } from './common';

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().min(0, 'Budget must be at least 0'),
);

const createProjectBaseSchema = z.object({
  name: z
    .string({ required_error: 'Project name is required' })
    .trim()
    .min(2, 'Project name must be at least 2 characters')
    .max(200, 'Project name must be at most 200 characters'),
  clientId: z
    .string({ required_error: 'Client id is required' })
    .trim()
    .min(1, 'Client id is required'),
  description: z
    .string()
    .trim()
    .max(5000, 'Description must be at most 5000 characters')
    .optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema.optional(),
  status: z
    .enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'])
    .default('planning'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  budget: optionalNumber.optional(),
  assignedTeam: z.array(z.string().trim().min(1, 'Assigned team member is required')).optional(),
  tenantId: z
    .string({ required_error: 'Tenant id is required' })
    .trim()
    .min(1, 'Tenant id is required'),
});

export const createProjectSchema = createProjectBaseSchema.superRefine((data, ctx) => {
  if (data.endDate && new Date(data.endDate).getTime() <= new Date(data.startDate).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be after start date',
      path: ['endDate'],
    });
  }
});

export const updateProjectSchema = createProjectBaseSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
