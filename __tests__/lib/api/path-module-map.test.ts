import { PATH_TO_MODULE, PLAN_MODULE_KEYS, resolveModuleForPath } from '@/lib/api/module-paths';
import { PLAN_MODULES } from '@/app/config/plans';

/**
 * Page path -> module map integrity (module enforcement correctness).
 *
 * Middleware gates each page path on a plan module and redirects to
 * /module-disabled when the tenant's plan does not enable it. Because
 * canAccessPlanModule fails closed on an UNKNOWN module key, a path mapped to a
 * value that is not a real plan module key is gated on a module that can never be
 * enabled — the page becomes permanently unreachable for every tenant.
 *
 * This previously affected `/billing` (mapped to 'billing') and `/clients`
 * (mapped to 'clients'): both are real pages, and both silently redirected every
 * logged-in tenant to /module-disabled. `/billing` is now un-gated (a locked-out
 * tenant must reach it to pay) and `/clients` maps to its real module, `crm`.
 */

describe('page path -> module map integrity', () => {
  it('exposes the real plan module keys', () => {
    expect(new Set(PLAN_MODULE_KEYS)).toEqual(new Set(Object.keys(PLAN_MODULES.starter)));
  });

  it('every mapped module is a real plan module key', () => {
    const valid = new Set(PLAN_MODULE_KEYS);
    const invalid = Object.entries(PATH_TO_MODULE)
      .filter(([, moduleKey]) => !valid.has(moduleKey))
      .map(([path, moduleKey]) => `${path} -> ${moduleKey}`);
    expect(invalid).toEqual([]);
  });

  it('billing is never module-gated (a locked-out tenant must reach it to pay)', () => {
    expect(resolveModuleForPath('/billing')).toBeNull();
    expect(resolveModuleForPath('/billing/invoices')).toBeNull();
  });

  it('clients resolves to crm (core CRM, not a bespoke "clients" module)', () => {
    expect(resolveModuleForPath('/clients')).toBe('crm');
    expect(PATH_TO_MODULE['/clients']).toBe('crm');
  });

  it('resolves exact and nested paths', () => {
    expect(resolveModuleForPath('/finance')).toBe('finance');
    expect(resolveModuleForPath('/finance/reports')).toBe('finance');
    expect(resolveModuleForPath('/hr/employees')).toBe('hr');
  });

  it('matches only on a full path segment, not a substring prefix', () => {
    expect(resolveModuleForPath('/financely')).toBeNull();
    expect(resolveModuleForPath('/salesforce')).toBeNull();
  });

  it('returns null for un-gated paths', () => {
    expect(resolveModuleForPath('/dashboard')).toBeNull();
    expect(resolveModuleForPath('/settings')).toBeNull();
  });
});
