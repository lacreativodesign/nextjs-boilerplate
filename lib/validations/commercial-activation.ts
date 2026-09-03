import { z } from 'zod';
import { PIPELINE_STAGES } from '@/lib/sales/utils';
import { PROJECT_MILESTONE_STAGES } from '@/lib/finance/paymentSchedule';

const optionalString = z.string().trim().max(500).optional().nullable();
const optionalDateInput = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .optional()
  .nullable();

export const dealCommercialUpdateSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    dealName: z.string().trim().min(1).max(300).optional(),
    clientName: z.string().trim().min(1).max(300).optional(),
    stage: z.enum(PIPELINE_STAGES).optional(),
    valueUsd: z.coerce.number().finite().min(0).max(100_000_000).optional(),
    probability: z.coerce.number().finite().min(0).max(100).optional(),
    ownerId: optionalString,
    ownerName: optionalString,
    expectedCloseDate: optionalDateInput,
    paymentPlan: z.enum(['full', 'fifty_fifty']).optional(),
    balanceTriggerType: z.enum(['date', 'milestone']).optional().nullable(),
    balanceDueDate: optionalDateInput,
    balanceMilestoneStage: z.enum(PROJECT_MILESTONE_STAGES).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.paymentPlan !== 'fifty_fifty') return;

    if (!value.balanceTriggerType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['balanceTriggerType'],
        message: '50/50 payment terms require a balance due date or project milestone.',
      });
      return;
    }

    if (value.balanceTriggerType === 'date' && !value.balanceDueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['balanceDueDate'],
        message: 'Balance due date is required for a date-based 50/50 payment plan.',
      });
    }

    if (value.balanceTriggerType === 'milestone' && !value.balanceMilestoneStage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['balanceMilestoneStage'],
        message: 'A project milestone is required for a milestone-based 50/50 payment plan.',
      });
    }
  });

export const publicInvoicePaySchema = z
  .object({
    paymentMethodId: z.string().trim().min(1).max(300),
    email: z.string().trim().email().max(320).optional(),
    token: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const publicInvoiceConfirmSchema = z
  .object({
    paymentIntentId: z.string().trim().min(1).max(300),
    token: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type DealCommercialUpdateInput = z.infer<typeof dealCommercialUpdateSchema>;
