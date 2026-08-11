import fs from 'fs';
import path from 'path';
import { plans } from '@/lib/billing/plans';
import { PLAN_MODULES } from '@/app/config/plans';

/**
 * PLAN-1 / SET-2 — a workspace is provisioned on the plan that was bought.
 *
 * createTenantWorkspace() wrote the literal `plan: 'trial'` into every tenant document,
 * whatever the customer selected and paid for at signup. `plan` is the live entitlement
 * field — checkModuleAccess() and every module guard resolve capability from it — so a
 * Pro or Enterprise customer was provisioned with trial entitlement, while the `modules`
 * map written on the very next line was computed from their real plan. The document
 * disagreed with itself from the moment it was created.
 *
 * Three further problems sat in the same function:
 *
 *   - `limits` was a second hard-coded copy of the plan catalog, and it disagreed on
 *     every tier: 50 users for Pro against a real limit of 20, 200 for Enterprise which
 *     is actually unlimited, 5GB storage for Starter against 20GB.
 *   - getModulesForPlan() re-derived its own plan key and derived it DIFFERENTLY, with no
 *     'trial' branch, so `modules` and `modulesEnabled` in one document could describe
 *     two different entitlements.
 *   - getFinanceSettings() fell back to a shared global `settings/finance` document, so a
 *     tenant that had never saved finance settings inherited a stranger's invoice prefix,
 *     AR buckets, FX rate and late-fee policy.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped: prose describing the old behaviour is not behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const ONBOARDING = 'lib/tenant/onboarding.ts';
const SETTINGS_UTILS = 'app/api/admin/settings/_utils.ts';
const FINANCE_ROUTE = 'app/api/admin/settings/finance/route.ts';

describe('PLAN-1: the tenant document records the plan that was purchased', () => {
  const src = active(ONBOARDING);

  it('persists the resolved plan key, not a hard-coded literal', () => {
    expect(src).toContain('plan: planKey');
    expect(src).not.toMatch(/plan:\s*['"]trial['"]/);
  });

  it('resolves pro from both spellings the API accepts', () => {
    // 'professional' is the legacy alias; 'pro' previously fell through to starter.
    expect(src).toContain("plan === 'professional'");
    expect(src).toContain("plan === 'pro'");
  });

  it('writes entitlement and modules from the same key', () => {
    expect(src).toContain('modules: PLAN_MODULES[planKey]');
    expect(src).toContain('getModulesForPlan(planKey)');
  });

  it('derives the module map once, from the key it was handed', () => {
    // getModulesForPlan used to re-derive its own key with no 'trial' branch, so
    // `modules` and `modulesEnabled` could describe different entitlements.
    const fn = src.slice(src.indexOf('function getModulesForPlan('));
    expect(fn).toContain('getModulesForPlan(planKey: BillingPlanKey)');
    expect(fn.slice(0, 300)).not.toContain("plan === 'professional'");
  });

  it('still keeps trial status distinct from the purchased tier', () => {
    // A trial is a STATE of a plan. `status` carries it; `plan` carries entitlement.
    expect(src).toMatch(/status:\s*plan === 'trial' \? 'trial' : 'active'/);
  });
});

describe('PLAN-1: limits come from the catalog, not a second copy', () => {
  const src = active(ONBOARDING);

  it('reads the limits off the plan definition', () => {
    expect(src).toContain('plans[planKey].limits');
    expect(src).toContain('users: planLimits.users');
    expect(src).toContain('storage: planLimits.storage');
    expect(src).toContain('apiCalls: planLimits.api_calls');
  });

  it('hard-codes no seat or storage numbers', () => {
    const limitsBlock = src.slice(src.indexOf('limits: {'), src.indexOf('modulesEnabled'));
    expect(limitsBlock).not.toMatch(/\b(10|50|200|5368709120|107374182400|250000|10000)\b/);
  });

  it('the catalog it now reads disagrees with what was hard-coded, which was the bug', () => {
    // Documents the drift rather than asserting the old numbers were fine.
    expect(plans.pro.limits.users).toBe(20); // was hard-coded as 50
    expect(plans.enterprise.limits.users).toBe(-1); // unlimited; was hard-coded as 200
    expect(plans.starter.limits.storage).toBeGreaterThan(5368709120); // was 5GB
  });

  it('every plan key the resolver can produce exists in both catalogs', () => {
    for (const key of ['trial', 'starter', 'pro', 'enterprise'] as const) {
      expect(plans[key]).toBeDefined();
      expect(PLAN_MODULES[key]).toBeDefined();
    }
  });
});

describe('SET-2: finance settings never come from another tenant', () => {
  const utils = active(SETTINGS_UTILS);
  const route = active(FINANCE_ROUTE);

  it('requires a tenantId at compile time', () => {
    expect(utils).toMatch(/getFinanceSettings\(tenantId: string\)/);
    expect(utils).not.toMatch(/getFinanceSettings\(\s*tenantId\?/);
  });

  it('throws on a blank tenant rather than reaching for a global document', () => {
    const body = utils.slice(utils.indexOf('export async function getFinanceSettings('));
    expect(body.slice(0, 400)).toContain('getFinanceSettings: tenantId is required');
  });

  it('reads only the tenant document', () => {
    expect(utils).toContain('`${scopedTenantId}_finance`');
    expect(utils).not.toMatch(/\.doc\(\s*['"`]finance['"`]\s*\)/);
  });

  it('the settings route no longer falls back to the shared document either', () => {
    expect(route).toContain('`${auth.user.tenantId}_finance`');
    expect(route).not.toMatch(/\.doc\(\s*['"`]finance['"`]\s*\)/);
    expect(route).not.toContain('legacySnap');
  });

  it('leaves no unscoped caller anywhere', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const rel = path.relative(ROOT, full);
          if (/getFinanceSettings\(\)/.test(active(rel))) offenders.push(rel);
        }
      }
    };
    for (const root of ['app', 'lib']) walk(path.join(ROOT, root));
    expect(offenders).toEqual([]);
  });
});
