import fs from 'fs';
import path from 'path';
import { PLAN_MODULES } from '@/app/config/plans';
import { canAccessPlanModule, resolveTenantModules } from '@/lib/tenant/plan-access';

/**
 * P-1 regression guard.
 *
 * Middleware sets `shouldSkipModuleCheck` to true for every `/api` path, so plan
 * entitlement on the API is enforced entirely by the per-namespace guards. Four
 * guards called `requireModule` and five did not, which meant a Starter tenant was
 * redirected away from /production in the browser but could drive all of
 * /api/production/* directly. That breaks the core commercial promise: a Pro
 * subscriber gets Pro, and a Starter subscriber gets Starter.
 *
 * These tests pin that every module guard consults the plan, and that the plan
 * tables themselves still say what the pricing page sells.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** Every API guard that gates a plan module, and the module it must check. */
const MODULE_GUARDS: Array<{ file: string; guard: string; moduleKey: string }> = [
  { file: 'app/api/finance/_utils.ts', guard: 'requireFinance', moduleKey: 'finance' },
  { file: 'app/api/production/_utils.ts', guard: 'getProductionUser', moduleKey: 'production' },
  {
    file: 'app/api/production/resources/_utils.ts',
    guard: 'getResourcePlannerUser',
    moduleKey: 'production',
  },
  { file: 'app/api/am/_utils.ts', guard: 'getAmUser', moduleKey: 'sales' },
  { file: 'app/api/sales/_utils.ts', guard: 'requireSalesRead', moduleKey: 'sales' },
  { file: 'lib/crm.ts', guard: 'requireCrmUser', moduleKey: 'crm' },
];

describe('P-1: every module guard enforces the plan', () => {
  it.each(MODULE_GUARDS)('$guard checks the $moduleKey module', ({ file, moduleKey }) => {
    const src = read(file);
    const checksPlan = src.includes('checkModuleAccess') || src.includes('requireModule');
    expect(checksPlan).toBe(true);
    expect(src).toContain(`'${moduleKey}'`);
  });

  it('the shared gate exists so the check is not copy-pasted per guard', () => {
    const src = read('app/lib/plan-enforcement.ts');
    expect(src).toContain('export async function checkModuleAccess');
    // Must not throw: guards return result objects and would turn a plan denial
    // into a 500 if this rejected.
    expect(src).toContain('isPlanAccessError(err)');
  });

  it('guards returning a result object surface the upgrade status, not a bare 403', () => {
    for (const file of [
      'app/api/production/resources/_utils.ts',
      'app/api/sales/_utils.ts',
      'lib/crm.ts',
    ]) {
      expect(read(file)).toContain('status: planAccess.status');
    }
  });

  it('sales write is gated as well as sales read', () => {
    const src = read('app/api/sales/_utils.ts');
    const writeBlock = src.slice(src.indexOf('export async function requireSalesWrite'));
    expect(writeBlock).toContain('checkModuleAccess');
  });
});

describe('P-1: the plan tables still match what is sold', () => {
  it('Starter does not include production, approvals, finance, hr or Stripe Connect', () => {
    for (const moduleKey of [
      'production',
      'approvals',
      'finance',
      'hr',
      'client_stripe_connect',
    ] as const) {
      expect(PLAN_MODULES.starter[moduleKey]).toBe(false);
      expect(PLAN_MODULES.trial[moduleKey]).toBe(false);
    }
  });

  it('Pro adds production and approvals', () => {
    expect(PLAN_MODULES.pro.production).toBe(true);
    expect(PLAN_MODULES.pro.approvals).toBe(true);
  });

  it('every tier includes the core crm, sales, projects and reports modules', () => {
    for (const tier of ['trial', 'starter', 'pro', 'enterprise'] as const) {
      for (const moduleKey of ['crm', 'sales', 'projects', 'reports'] as const) {
        expect(PLAN_MODULES[tier][moduleKey]).toBe(true);
      }
    }
  });
});

describe('P-1: a Starter tenant is denied the modules it did not buy', () => {
  const starterModules = resolveTenantModules({ plan: 'starter' });

  it.each(['production', 'approvals', 'finance', 'hr'] as const)(
    'denies %s to a Starter admin',
    (moduleKey) => {
      expect(canAccessPlanModule({ modules: starterModules, moduleKey, role: 'admin' })).toBe(
        false,
      );
    },
  );

  it('still allows a Starter admin the modules it did buy', () => {
    for (const moduleKey of ['crm', 'sales', 'projects', 'reports'] as const) {
      expect(canAccessPlanModule({ modules: starterModules, moduleKey, role: 'admin' })).toBe(true);
    }
  });

  it('allows a Pro tenant the production module', () => {
    const proModules = resolveTenantModules({ plan: 'pro' });
    expect(
      canAccessPlanModule({ modules: proModules, moduleKey: 'production', role: 'admin' }),
    ).toBe(true);
  });

  it('fails closed on a missing or malformed module map', () => {
    expect(canAccessPlanModule({ modules: null, moduleKey: 'production', role: 'admin' })).toBe(
      false,
    );
    expect(canAccessPlanModule({ modules: {}, moduleKey: 'production', role: 'admin' })).toBe(
      false,
    );
  });

  it('never locks out super_admin, so the platform can always operate', () => {
    expect(
      canAccessPlanModule({
        modules: starterModules,
        moduleKey: 'production',
        role: 'super_admin',
      }),
    ).toBe(true);
  });
});
