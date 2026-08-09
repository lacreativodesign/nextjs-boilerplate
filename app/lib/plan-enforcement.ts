import { adminDb } from '@/lib/firebaseAdmin';
import {
  canAccessPlanModule,
  normalizePlan,
  resolvePlanModules,
  resolveTenantModules,
  type PlanModuleKey,
  type PlanModules,
  type PlanTier,
} from '@/lib/tenant/plan-access';

type PlanSetBy = {
  uid: string;
  role: 'super_admin';
};

export type TenantPlanState = {
  plan: PlanTier;
  modules: PlanModules;
  planSetBy?: PlanSetBy | null;
  planUpdatedAt?: any;
};

/**
 * S9: per-instance plan cache.
 *
 * checkModuleAccess() runs in every module guard, so before this cache each guarded API
 * request performed its own `tenants/{tenantId}` document read — one Firestore read per
 * request on the hot path of nine namespaces, for a document that changes only when an
 * operator edits a plan or Stripe reports a subscription change.
 *
 * Staleness is bounded by TTL, not by invalidation. The cache lives in the process, so a
 * serverless deployment holds one copy per warm instance and no instance can clear
 * another's. Thirty seconds is deliberately the same bound middleware already accepts for
 * page gating, where /api/tenant/module-check responds with `Cache-Control: max-age=30`.
 * An entitlement change is therefore visible everywhere within 30s, which is the contract
 * the product already shipped.
 */
const PLAN_CACHE_TTL_MS = 30_000;

/** Ceiling on tracked tenants so a long-lived instance cannot grow without bound. */
const PLAN_CACHE_MAX_ENTRIES = 500;

type PlanCacheEntry = { expiresAt: number; state: TenantPlanState };

const planCache = new Map<string, PlanCacheEntry>();

function sweepPlanCache(now: number) {
  for (const [key, entry] of planCache) {
    if (entry.expiresAt <= now) planCache.delete(key);
  }
  // Every entry is still live and we are over the ceiling: drop the oldest insertions,
  // which Map iterates first. Losing them costs one Firestore read each, never accuracy.
  while (planCache.size >= PLAN_CACHE_MAX_ENTRIES) {
    const oldest = planCache.keys().next();
    if (oldest.done) break;
    planCache.delete(oldest.value);
  }
}

/**
 * Drops a cached plan so the next read hits Firestore.
 *
 * Best-effort and local to this instance — call it after writing a tenant's plan or
 * modules so the operator who made the change sees it immediately on this instance. The
 * TTL above, not this call, is what guarantees every instance converges.
 * Called with no argument, clears the whole cache.
 */
export function invalidateTenantPlanCache(tenantId?: string | null) {
  if (tenantId === undefined || tenantId === null) {
    planCache.clear();
    return;
  }
  planCache.delete(String(tenantId));
}

export async function getTenantPlanState(tenantId: string): Promise<TenantPlanState> {
  const cacheKey = String(tenantId);
  const now = Date.now();

  const cached = planCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.state;
  }

  const snap = await adminDb.collection('tenants').doc(tenantId).get();
  if (!snap.exists) {
    // A missing tenant is never cached: the document may be created moments later
    // during signup, and a cached miss would lock that workspace out for the TTL.
    throw new Error('Tenant not found');
  }

  const data = snap.data() || {};
  const plan = normalizePlan(data.plan);
  const modules = resolveTenantModules({
    plan,
    modules: data.modules,
    legacyModulesEnabled: data.modulesEnabled,
  });
  const planSetBy = data.planSetBy as PlanSetBy | undefined;
  const planUpdatedAt = data.planUpdatedAt || null;

  const state: TenantPlanState = {
    plan,
    modules,
    planSetBy,
    planUpdatedAt,
  };

  sweepPlanCache(now);
  planCache.set(cacheKey, { expiresAt: now + PLAN_CACHE_TTL_MS, state });

  return state;
}

export class PlanAccessError extends Error {
  status = 403;
  moduleKey: PlanModuleKey;

  constructor(moduleKey: PlanModuleKey) {
    super(`Upgrade required to access ${moduleKey}.`);
    this.moduleKey = moduleKey;
  }
}

export function isPlanAccessError(error: unknown): error is PlanAccessError {
  return error instanceof PlanAccessError;
}

export async function requireModule(
  tenantId: string,
  moduleKey: PlanModuleKey,
  options?: { role?: string | null },
) {
  const planState = await getTenantPlanState(tenantId);
  if (!canAccessPlanModule({ modules: planState.modules, moduleKey, role: options?.role })) {
    throw new PlanAccessError(moduleKey);
  }
  return planState;
}

/**
 * Non-throwing module gate for API guards (P-1).
 *
 * Middleware sets `shouldSkipModuleCheck` to true for every `/api` path, so plan
 * entitlement on the API is enforced entirely by the per-namespace guards. Four
 * guards did it and five did not, which meant a Starter tenant was blocked from
 * /production in the browser but could drive every /api/production/* route directly.
 *
 * The check lives here, once, so the guards cannot drift apart again the way they
 * did when it was copied by hand into some of them and not others.
 */
export async function checkModuleAccess(
  tenantId: string | null | undefined,
  moduleKey: PlanModuleKey,
  role?: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    await requireModule(String(tenantId || ''), moduleKey, { role });
    return { ok: true };
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false, status: err.status, error: err.message };
    }
    return { ok: false, status: 500, error: 'Unable to validate plan access.' };
  }
}

export { normalizePlan, resolvePlanModules, resolveTenantModules };
