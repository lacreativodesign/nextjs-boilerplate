import { PLAN_MODULES } from '@/app/config/plans';
import type { PlanModuleKey } from '@/lib/tenant/plan-access';

/**
 * Maps a top-level page path prefix to the plan module that gates it. Middleware
 * redirects to /module-disabled when the tenant's plan does not enable the module.
 *
 * INVARIANT: every value MUST be a valid plan module key (a key of PLAN_MODULES).
 * `canAccessPlanModule` fails closed on an unknown key, so a path mapped to a
 * non-module string (the old 'billing' / 'clients' / 'inventory' / 'support'
 * values) is gated on a module that can NEVER be enabled and the page becomes
 * permanently unreachable. Typing the map as Record<string, PlanModuleKey> makes
 * an invalid value a compile error; path-module-map.test.ts is the runtime backstop.
 *
 * Billing is deliberately NOT gated: a locked-out or trialing tenant must always be
 * able to reach /billing to pay or change plan. Subscription lock state is enforced
 * separately by the subscription gates, not by module access. `/clients` is core
 * CRM (enabled on every plan), so it maps to `crm`.
 */
export const PATH_TO_MODULE: Record<string, PlanModuleKey> = {
  '/finance': 'finance',
  '/sales': 'sales',
  '/sales_manager': 'sales',
  '/hr': 'hr',
  '/production': 'production',
  '/production_manager': 'production',
  '/am': 'sales',
  '/am_manager': 'sales',
  '/clients': 'crm',
  '/projects': 'projects',
  '/reports': 'reports',
  '/crm': 'crm',
  '/approvals': 'approvals',
  '/notifications': 'notifications',
};

/**
 * Resolves the plan module gating a page path, or null if the path is not
 * module-gated. A prefix only matches on a full path segment, so `/financely`
 * does not match `/finance`.
 */
export function resolveModuleForPath(pathname: string): PlanModuleKey | null {
  const matched = Object.entries(PATH_TO_MODULE).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return matched ? matched[1] : null;
}

/** The set of valid plan module keys, exported for the map-integrity guard test. */
export const PLAN_MODULE_KEYS = Object.keys(PLAN_MODULES.starter) as PlanModuleKey[];
