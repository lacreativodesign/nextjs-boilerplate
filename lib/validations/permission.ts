import { z } from 'zod';
import { FIELD_ACCESS_LEVELS, PERMISSION_ACTIONS } from '@/lib/permissions/types';

/**
 * SOC2 F-06: schemas for the permission surface.
 *
 * These routes decide who can do what, and they accepted whatever JSON arrived.
 * `permissions/roles` had a hand-rolled `validatePermissions` that checked
 * `Array.isArray(item.actions)` without checking what was IN the array, so a role
 * could be stored carrying arbitrary objects as actions. Nothing bounded the number
 * of permission entries or the length of a role name either, so a single request
 * could persist a document large enough to slow every later permission evaluation
 * that reads it.
 *
 * The bounds below are deliberate rather than defensive decoration:
 *  - actions and field access levels are closed enums drawn from the same constants
 *    the permission engine evaluates, so an unknown action cannot be persisted;
 *  - `.strict()` rejects unknown keys, so a payload cannot smuggle extra fields into
 *    a document that is spread into Firestore;
 *  - the caps are far above any real role (the largest shipped template has well
 *    under fifty entries) and far below anything that would degrade evaluation.
 */

export const permissionSetSchema = z
  .object({
    module: z.string().min(1).max(64),
    entity: z.string().min(1).max(64),
    actions: z.array(z.enum(PERMISSION_ACTIONS)).max(PERMISSION_ACTIONS.length),
    fields: z.record(z.string().max(64), z.enum(FIELD_ACCESS_LEVELS)).optional(),
    ownOnly: z.boolean().optional(),
  })
  .strict();

export const createRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Left optional rather than `.default('')`: a `.default()` makes the schema's
    // input and output types differ, and `validateRequest<T>(schema: ZodSchema<T>)`
    // cannot infer T cleanly when they do. The caller supplies the fallback.
    description: z.string().trim().max(500).optional(),
    permissions: z.array(permissionSetSchema).max(200),
    parentRoleId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();

export const applyTemplateSchema = z
  .object({
    templateKey: z.string().min(1).max(64),
    roleName: z.string().trim().min(1).max(120).optional(),
    // The target of a role grant. Tenant scoping is enforced by the caller from the
    // session; this only constrains the shape.
    userId: z.string().min(1).max(128).optional(),
  })
  .strict();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
