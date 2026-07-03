import { FieldValue } from 'firebase-admin/firestore';
import { PLAN_MODULES } from '@/app/config/plans';
import { adminDb } from '@/lib/firebaseAdmin';
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

  const planKey =
    plan === 'professional'
      ? 'pro'
      : plan === 'enterprise'
        ? 'enterprise'
        : plan === 'trial'
          ? 'trial'
          : plan === 'starter'
            ? 'starter'
            : 'trial';

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
      plan: 'trial',
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
      limits: {
        users:
          plan === 'trial' || plan === 'starter'
            ? 10
            : plan === 'professional' || plan === 'pro'
              ? 50
              : 200,
        storage: plan === 'enterprise' ? 107374182400 : 5368709120,
        apiCalls: plan === 'enterprise' ? 250000 : 10000,
      },
      modulesEnabled: getModulesForPlan(plan),
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

function getModulesForPlan(plan: TenantPlan) {
  const planKey =
    plan === 'professional' ? 'pro' : plan === 'enterprise' ? 'enterprise' : 'starter';
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
