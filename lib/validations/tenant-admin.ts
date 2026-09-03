import { z } from 'zod';
import { DEFAULT_MODULES } from '@/lib/tenant/constants';

/**
 * SOC2 F-06: schemas for the super_admin tenant mutation surface.
 *
 * These two routes reach across tenant boundaries by design, so they are the last
 * place an unchecked body belongs.
 *
 * `modulesEnabled` was accepted after a single `typeof value === 'object'` test and
 * written to the tenant document verbatim. Any key and any value type could be
 * stored — `{ finance: 'yes' }`, `{ __proto__: {...} }`, a thousand invented module
 * names. That map is read by `resolveTenantModules` and cached by the plan layer, so
 * a malformed value becomes a stale entitlement decision that outlives the request.
 *
 * `logoUrl` was accepted as any string and rendered into an `<img src>` on the tenant
 * branding page. Constraining it to an absolute http(s) URL keeps `javascript:` and
 * `data:` payloads out of a field that is displayed to every user in the workspace.
 */

/** The canonical module keys. Derived from the constant the tenant layer reads. */
export const MODULE_KEYS = Object.keys(DEFAULT_MODULES) as [string, ...string[]];

export const modulesEnabledSchema = z
  .record(z.enum(MODULE_KEYS), z.boolean())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one module must be supplied.',
  });

export const updateTenantModulesSchema = z
  .object({
    modulesEnabled: modulesEnabledSchema,
  })
  .strict();

export const updateTenantBrandingSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    logoUrl: z
      .string()
      .trim()
      .max(2048)
      .url()
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'logoUrl must be an absolute http(s) URL.',
      })
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateTenantModulesInput = z.infer<typeof updateTenantModulesSchema>;
export type UpdateTenantBrandingInput = z.infer<typeof updateTenantBrandingSchema>;
