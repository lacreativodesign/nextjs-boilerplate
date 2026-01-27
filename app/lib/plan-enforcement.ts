import { adminDb } from "@/lib/firebaseAdmin";
import { PLAN_MODULES } from "@/app/config/plans";

export type PlanTier = keyof typeof PLAN_MODULES;
export type PlanModuleKey = keyof typeof PLAN_MODULES.starter;

export type PlanModules = Record<PlanModuleKey, boolean>;

type PlanSetBy = {
  uid: string;
  role: "super_admin";
};

export type TenantPlanState = {
  plan: PlanTier;
  modules: PlanModules;
  planSetBy?: PlanSetBy | null;
  planUpdatedAt?: any;
};

const PLAN_KEYS = Object.keys(PLAN_MODULES) as PlanTier[];

export function normalizePlan(plan: unknown): PlanTier {
  const normalized = String(plan || "").toLowerCase();
  return PLAN_KEYS.includes(normalized as PlanTier) ? (normalized as PlanTier) : "pro";
}

function normalizeModules(input: unknown): Partial<PlanModules> {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  return entries.reduce<Partial<PlanModules>>((acc, [key, value]) => {
    if (key in PLAN_MODULES.starter) {
      acc[key as PlanModuleKey] = Boolean(value);
    }
    return acc;
  }, {});
}

export function resolvePlanModules(plan: PlanTier, overrides?: Record<string, unknown>): PlanModules {
  return {
    ...PLAN_MODULES[plan],
    ...normalizeModules(overrides),
  };
}

export function resolveTenantModules({
  plan,
  modules,
  legacyModulesEnabled,
}: {
  plan: PlanTier;
  modules?: Record<string, unknown>;
  legacyModulesEnabled?: Record<string, unknown>;
}): PlanModules {
  const hasExplicitModules = Boolean(modules && typeof modules === "object");
  const baseModules = resolvePlanModules(plan, hasExplicitModules ? modules : {});

  if (!hasExplicitModules && legacyModulesEnabled && typeof legacyModulesEnabled === "object") {
    const legacy = legacyModulesEnabled as Record<string, unknown>;
    const legacyOverrides: Partial<PlanModules> = {};
    if (legacy.finance !== undefined) legacyOverrides.finance = Boolean(legacy.finance);
    if (legacy.notifications !== undefined) legacyOverrides.notifications = Boolean(legacy.notifications);
    if (legacy.humanResource !== undefined) legacyOverrides.hr = Boolean(legacy.humanResource);
    return {
      ...baseModules,
      ...legacyOverrides,
    };
  }

  return baseModules;
}

export async function getTenantPlanState(tenantId: string): Promise<TenantPlanState> {
  const snap = await adminDb.collection("tenants").doc(tenantId).get();
  if (!snap.exists) {
    throw new Error("Tenant not found");
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

export async function requireModule(tenantId: string, moduleKey: PlanModuleKey) {
  const planState = await getTenantPlanState(tenantId);
  if (!planState.modules[moduleKey]) {
    throw new PlanAccessError(moduleKey);
  }
  return planState;
}
