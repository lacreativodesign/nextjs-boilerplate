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

export async function getTenantPlanState(tenantId: string): Promise<TenantPlanState> {
  const snap = await adminDb.collection('tenants').doc(tenantId).get();
  if (!snap.exists) {
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

  return {
    plan,
    modules,
    planSetBy,
    planUpdatedAt,
  };
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

export { normalizePlan, resolvePlanModules, resolveTenantModules };
