import { FieldValue } from 'firebase-admin/firestore';
import { PLAN_MODULES } from '@/app/config/plans';
import { adminDb } from '@/lib/firebaseAdmin';
import { plans, type BillingPlanKey } from '@/lib/billing/plans';
import { DEFAULT_MODULES } from '@/lib/tenant/constants';
import { scheduleOnboardingEmails, sendWelcomeEmail } from '@/lib/email/onboarding-emails';

export type TenantPlan = 'trial' | 'starter' | 'pro' | 'professional' | 'enterprise';

type CreateTenantWorkspaceInput = {
  tenantId: string;
  name: string;
  fullName?: string;
  email: string;
  plan: TenantPlan;
  ownerId?: string;
  trialEndsAt?: string;
};

type OnboardingStep = {
  id: 'profile' | 'team' | 'client' | 'invoice';
  title: string;
  completed: boolean;
};

const onboardingSteps: OnboardingStep[] = [
  { id: 'profile', title: 'Complete Profile', completed: false },
  { id: 'team', title: 'Invite Team', completed: false },
  { id: 'client', title: 'Add First Client', completed: false },
  { id: 'invoice', title: 'Create Invoice', completed: false },
];

export async function createTenantWorkspace(data: CreateTenantWorkspaceInput) {
  const { tenantId, name, fullName, email, plan, ownerId, trialEndsAt } = data;
  const recipientName = fullName || name;

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const checklistRef = tenantRef.collection('onboarding_progress').doc('checklist');

  // S6: an unrecognized plan previously fell through to 'trial', which granted every
  // paid module. Unknown input now provisions the least-privilege tier.
  const planKey: BillingPlanKey =
    plan === 'professional'
      ? 'pro'
      : plan === 'enterprise'
        ? 'enterprise'
        : plan === 'trial'
          ? 'trial'
          : plan === 'pro'
            ? 'pro'
            : 'starter';

  const planLimits = plans[planKey].limits;

  await adminDb.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const nowIso = new Date().toISOString();

    const tenantSnap = await tx.get(tenantRef);
    if (tenantSnap.exists) {
      throw new Error('TENANT_ALREADY_EXISTS');
    }

    tx.set(tenantRef, {
      id: tenantId,
      name,
      slug: tenantId,
      ownerId: ownerId || null,
      status: plan === 'trial' ? 'trial' : 'active',
      // PLAN-1: persist the plan the customer actually chose.
      //
      // This wrote the literal 'trial' for EVERY workspace, whatever was selected and paid
      // for at signup. `plan` is the live entitlement field — checkModuleAccess() and every
      // module guard resolve capability from it — so a customer who bought Pro or
      // Enterprise was provisioned with trial modules and trial limits, and the `modules`
      // map written on the next line disagreed with the `plan` field beside it from the
      // moment the document was created.
      plan: planKey,
      modules: PLAN_MODULES[planKey],
      trialEndsAt: trialEndsAt || null,
      createdAt: nowIso,
      updatedAt: nowIso,
      settings: {
        currency: 'USD',
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        language: 'en',
      },
      // PLAN-1: limits come from the catalog, not from a second hard-coded copy.
      //
      // The numbers written here disagreed with lib/billing/plans.ts on every tier: 50
      // users for Pro against a real limit of 20, 200 for Enterprise which is actually
      // unlimited, 5GB storage for Starter against 20GB. They were never load-bearing —
      // checkUserLimit() and the storage guard both read the catalog — so this was stale
      // data that only misled anyone inspecting a tenant document. Writing the catalog
      // values keeps the snapshot honest and makes the drift impossible.
      limits: {
        users: planLimits.users,
        storage: planLimits.storage,
        apiCalls: planLimits.api_calls,
      },
      modulesEnabled: getModulesForPlan(planKey),
      onboarding: {
        status: 'pending',
        startedAt: nowIso,
      },
      metadata: {
        createdBy: ownerId || 'system',
      },
    });

    tx.set(checklistRef, {
      steps: onboardingSteps,
      progress: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const notifications: { welcomeEmailSent: boolean; onboardingEmailsScheduled: boolean } = {
    welcomeEmailSent: false,
    onboardingEmailsScheduled: false,
  };

  try {
    await sendWelcomeEmail(email, recipientName, tenantId);
    notifications.welcomeEmailSent = true;
  } catch (error) {
    console.error('[ONBOARDING] Failed to send welcome email', { tenantId, email, error });
  }

  try {
    await scheduleOnboardingEmails(email, tenantId);
    notifications.onboardingEmailsScheduled = true;
  } catch (error) {
    console.error('[ONBOARDING] Failed to schedule onboarding emails', { tenantId, email, error });
  }

  return { success: true, tenantId, notifications };
}

/**
 * PLAN-1: takes the already-resolved plan key.
 *
 * It used to re-derive its own key from the raw input, and derive it DIFFERENTLY — it had
 * no 'trial' branch, so a trial workspace silently received starter modules here while
 * `modules` above received trial modules. Two maps describing the same entitlement,
 * computed two ways, written in the same document.
 */
function getModulesForPlan(planKey: BillingPlanKey) {
  const selectedPlan = PLAN_MODULES[planKey];

  return {
    ...DEFAULT_MODULES,
    crm: selectedPlan.crm,
    projects: selectedPlan.projects,
    notifications: selectedPlan.notifications,
    finance: selectedPlan.finance,
    hr: selectedPlan.hr,
  };
}
