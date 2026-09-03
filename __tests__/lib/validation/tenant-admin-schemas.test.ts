import fs from 'fs';
import path from 'path';
import { DEFAULT_MODULES } from '@/lib/tenant/constants';
import {
  updateTenantBrandingSchema,
  updateTenantModulesSchema,
} from '@/lib/validations/tenant-admin';

/**
 * SOC2 F-06 — schema validation on the super_admin tenant surface.
 *
 * These two routes reach across tenant boundaries by design, which makes them the
 * last place an unchecked body belongs.
 *
 * `modulesEnabled` passed a single `typeof value === 'object'` test and was written
 * to the tenant document verbatim. Any key and any value type could be stored. That
 * map is read by `resolveTenantModules` and cached by the plan layer, so a malformed
 * value does not fail at the boundary — it becomes a stale entitlement decision that
 * outlives the request.
 *
 * `logoUrl` was accepted as any string and is rendered into an `<img src>` on the
 * branding page, which every user in the workspace sees.
 *
 * A separate defect surfaced while reading these: the branding route never checked
 * that the tenant existed. `set(..., { merge: true })` CREATES a document when none
 * is present, so any tenantId in the URL minted a phantom tenant carrying nothing but
 * a brand — invisible to onboarding, absent from every plan and billing invariant,
 * and unreachable through the app.
 */

describe('updateTenantModulesSchema', () => {
  it('accepts the canonical module keys with boolean values', () => {
    const parsed = updateTenantModulesSchema.parse({
      modulesEnabled: { finance: false, crm: true },
    });
    expect(parsed.modulesEnabled).toEqual({ finance: false, crm: true });
  });

  it('rejects a module key that does not exist', () => {
    expect(() =>
      updateTenantModulesSchema.parse({ modulesEnabled: { not_a_module: true } }),
    ).toThrow();
  });

  it('rejects a non-boolean entitlement value', () => {
    // `{ finance: 'yes' }` was stored verbatim, then read back by the plan layer.
    expect(() => updateTenantModulesSchema.parse({ modulesEnabled: { finance: 'yes' } })).toThrow();
    expect(() => updateTenantModulesSchema.parse({ modulesEnabled: { finance: 1 } })).toThrow();
  });

  it('rejects an empty map rather than writing a no-op entitlement change', () => {
    expect(() => updateTenantModulesSchema.parse({ modulesEnabled: {} })).toThrow();
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      updateTenantModulesSchema.parse({ modulesEnabled: { crm: true }, plan: 'enterprise' }),
    ).toThrow();
  });

  it('stays in step with the module list the tenant layer reads', () => {
    // If a module is added to DEFAULT_MODULES, the schema must accept it without a
    // second edit. This is why MODULE_KEYS is derived rather than hand-written.
    const everyModule = Object.fromEntries(Object.keys(DEFAULT_MODULES).map((key) => [key, true]));
    expect(() => updateTenantModulesSchema.parse({ modulesEnabled: everyModule })).not.toThrow();
  });
});

describe('updateTenantBrandingSchema', () => {
  it('accepts a brand name with an https logo', () => {
    const parsed = updateTenantBrandingSchema.parse({
      name: 'Northreach',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    expect(parsed.logoUrl).toBe('https://cdn.example.com/logo.png');
  });

  it('accepts a null logo', () => {
    expect(updateTenantBrandingSchema.parse({ name: 'Northreach', logoUrl: null }).logoUrl).toBe(
      null,
    );
  });

  it('rejects a javascript: logo URL', () => {
    // Rendered into an <img src> shown to every user in the workspace.
    expect(() =>
      updateTenantBrandingSchema.parse({ name: 'N', logoUrl: 'javascript:alert(1)' }),
    ).toThrow();
  });

  it('rejects a data: logo URL', () => {
    expect(() =>
      updateTenantBrandingSchema.parse({
        name: 'N',
        logoUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      }),
    ).toThrow();
  });

  it('rejects an empty brand name, as the previous check did', () => {
    expect(() => updateTenantBrandingSchema.parse({ name: '   ' })).toThrow();
  });

  it('rejects unknown keys, including a locked override', () => {
    expect(() => updateTenantBrandingSchema.parse({ name: 'N', locked: false })).toThrow();
  });
});

const MUST_VALIDATE = [
  'app/api/super_admin/tenants/[tenantId]/modules/route.ts',
  'app/api/super_admin/tenants/[tenantId]/branding/route.ts',
];

describe('super_admin tenant routes', () => {
  it.each(MUST_VALIDATE)('%s validates its request body', (rel) => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(source).toContain('validateRequest(');
  });

  it('branding refuses to mint a tenant that does not exist', () => {
    const source = fs.readFileSync(path.join(process.cwd(), MUST_VALIDATE[1]), 'utf8');
    const existenceAt = source.indexOf('.exists');
    const writeAt = source.indexOf('await tenantRef.set(');

    expect(existenceAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(existenceAt);
    expect(source).toContain("error: 'Tenant not found'");
  });
});
