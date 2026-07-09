import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Server-side AI plan gate (AI-0b).
 *
 * The AI Workforce is a Pro/Enterprise feature (BYOK). Plan gating existed only
 * in the settings UI/route, so a Starter or trial tenant that obtained a task id
 * could still hit the run/tool endpoints directly. This enforces the plan on
 * every user-facing AI endpoint, matching the settings route's locked set
 * (starter and trial are AI-locked; pro and enterprise are allowed).
 *
 * Returns a discriminated result so callers can return a clean 403 with upgrade
 * guidance without throwing.
 */

const AI_LOCKED_PLANS = new Set(['starter', 'trial']);

export interface AiPlanCheck {
  ok: boolean;
  plan: string;
}

export async function checkAiPlan(tenantId: string): Promise<AiPlanCheck> {
  const snap = await adminDb.collection('tenants').doc(tenantId).get();
  const plan = String(snap.data()?.plan || 'starter').toLowerCase();
  return { ok: !AI_LOCKED_PLANS.has(plan), plan };
}

export function aiPlanLockedBody(check: AiPlanCheck) {
  return {
    ok: false,
    error: 'ai_plan_locked',
    message: `AI Workforce requires the Pro or Enterprise plan. Your current plan is ${check.plan}. Upgrade to enable AI agents.`,
    plan: check.plan,
  };
}
