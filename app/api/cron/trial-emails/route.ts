import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  sendTrialDayOneEmail,
  sendTrialDaySevenEmail,
  sendTrialDayThreeEmail,
  sendTrialExpiredEmail,
  sendTrialGracePeriodEndingEmail,
} from '@/lib/email/onboarding-emails';
import { PLAN_MODULES } from '@/app/config/plans';
import { isComped } from '@/lib/billing/billing-mode';
import { authorizeCronRequest } from '@/lib/cron/auth';

export const runtime = 'nodejs';

const configuredTenantBatchSize = Number(process.env.DAILY_TRIAL_TENANT_BATCH_SIZE || 25);
const TENANT_BATCH_SIZE = Number.isFinite(configuredTenantBatchSize)
  ? Math.min(50, Math.max(1, Math.floor(configuredTenantBatchSize)))
  : 25;

type ScheduledEmailState = {
  tenantId: string;
  email: string;
  status: 'pending';
  createdAt: string;
  day7Sent: boolean;
  day3Sent: boolean;
  day1Sent: boolean;
  expiredSent: boolean;
  gracePeriodEndSent: boolean;
  day7SentAt?: string;
  day3SentAt?: string;
  day1SentAt?: string;
  expiredSentAt?: string;
  gracePeriodEndSentAt?: string;
};

function defaultScheduledState(tenantId: string, email: string): ScheduledEmailState {
  return {
    tenantId,
    email,
    status: 'pending',
    createdAt: new Date().toISOString(),
    day7Sent: false,
    day3Sent: false,
    day1Sent: false,
    expiredSent: false,
    gracePeriodEndSent: false,
  };
}

export async function GET(request: NextRequest) {
  const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.code },
      { status: authorization.status },
    );
  }

  const errors: string[] = [];
  let emailsSent = 0;

  try {
    const cursorRef = adminDb.collection('cron_job_cursors').doc('trial-reminders');
    const cursorSnapshot = await cursorRef.get();
    const lastTenantId = String(cursorSnapshot.data()?.lastTenantId || '');
    const baseQuery = adminDb.collection('tenants').orderBy(admin.firestore.FieldPath.documentId());
    let query = baseQuery.limit(TENANT_BATCH_SIZE + 1);
    if (lastTenantId) query = baseQuery.startAfter(lastTenantId).limit(TENANT_BATCH_SIZE + 1);
    let tenantPage = await query.get();
    if (tenantPage.empty && lastTenantId) {
      await cursorRef.delete().catch(() => undefined);
      tenantPage = await baseQuery.limit(TENANT_BATCH_SIZE + 1).get();
    }
    const tenantDocs = tenantPage.docs.slice(0, TENANT_BATCH_SIZE);
    const truncated = tenantPage.size > TENANT_BATCH_SIZE;

    for (const tenantDoc of tenantDocs) {
      const tenantId = tenantDoc.id;
      try {
        const tenantData = tenantDoc.data() as {
          subscriptionState?: string;
          trialEndsAt?: string;
          status?: string;
          plan?: string;
          name?: string;
          ownerId?: string;
          billingMode?: string;
        };

        if (tenantData.subscriptionState !== 'trial' && tenantData.status !== 'grace_period') {
          continue;
        }

        // COMP-1: trial and dunning email asks a customer to pay. A comped workspace is
        // not going to, so "your trial ends in 3 days — add a card" is both wrong and
        // alarming for an internal or partner account that has been granted access
        // indefinitely.
        if (isComped(tenantData)) {
          continue;
        }

        if (!tenantData.trialEndsAt) {
          continue;
        }

        const usersSnapshot = await adminDb
          .collection('users')
          .where('tenantId', '==', tenantId)
          .where('role', '==', 'admin')
          .limit(1)
          .get();

        if (usersSnapshot.empty) {
          errors.push(`tenant:${tenantId} missing admin user`);
          continue;
        }

        const ownerData = usersSnapshot.docs[0].data() as {
          email?: string;
          displayName?: string;
        };

        if (!ownerData.email) {
          errors.push(`tenant:${tenantId} admin user missing email`);
          continue;
        }

        const ownerName = ownerData.displayName || 'there';
        const trialEndsAt = tenantData.trialEndsAt;

        const daysRemaining = Math.ceil(
          (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        const scheduledRef = adminDb.collection('scheduled_emails').doc(tenantId);
        const scheduledSnap = await scheduledRef.get();

        let scheduledState: ScheduledEmailState;
        if (!scheduledSnap.exists) {
          scheduledState = defaultScheduledState(tenantId, ownerData.email);
          await scheduledRef.set(scheduledState);
        } else {
          scheduledState = {
            ...defaultScheduledState(tenantId, ownerData.email),
            ...(scheduledSnap.data() as Partial<ScheduledEmailState>),
          };
        }

        const now = new Date().toISOString();

        if (daysRemaining === 7 && !scheduledState.day7Sent) {
          await sendTrialDaySevenEmail(ownerData.email, ownerName, tenantId, trialEndsAt);
          await scheduledRef.set(
            { day7Sent: true, day7SentAt: now, email: ownerData.email },
            { merge: true },
          );
          emailsSent += 1;
          continue;
        }

        if (daysRemaining === 3 && !scheduledState.day3Sent) {
          await sendTrialDayThreeEmail(ownerData.email, ownerName, tenantId, trialEndsAt);
          await scheduledRef.set(
            { day3Sent: true, day3SentAt: now, email: ownerData.email },
            { merge: true },
          );
          emailsSent += 1;
          continue;
        }

        if (daysRemaining === 1 && !scheduledState.day1Sent) {
          await sendTrialDayOneEmail(ownerData.email, ownerName, tenantId, trialEndsAt);
          await scheduledRef.set(
            { day1Sent: true, day1SentAt: now, email: ownerData.email },
            { merge: true },
          );
          emailsSent += 1;
          continue;
        }

        if (daysRemaining <= 0 && !scheduledState.expiredSent) {
          await sendTrialExpiredEmail(ownerData.email, ownerName, tenantId);
          await scheduledRef.set(
            { expiredSent: true, expiredSentAt: now, email: ownerData.email },
            { merge: true },
          );
          // Downgrade to starter modules so sidebar hides Finance, Production, HR
          // until the tenant upgrades to a paid plan
          await adminDb.collection('tenants').doc(tenantId).set(
            {
              status: 'grace_period',
              subscriptionState: 'grace',
              billingStatus: 'past_due',
              plan: 'starter',
              modules: PLAN_MODULES.starter,
            },
            { merge: true },
          );
          emailsSent += 1;
          continue;
        }

        if (daysRemaining <= -12 && !scheduledState.gracePeriodEndSent) {
          await sendTrialGracePeriodEndingEmail(ownerData.email, ownerName, tenantId);
          await scheduledRef.set(
            { gracePeriodEndSent: true, gracePeriodEndSentAt: now, email: ownerData.email },
            { merge: true },
          );
          // Hard lock — middleware blocks all access, module state does not matter
          // but set starter modules so if they reactivate they start from the right baseline
          await adminDb.collection('tenants').doc(tenantId).set(
            {
              status: 'hard_locked',
              subscriptionState: 'hard_locked',
              billingStatus: 'canceled',
              plan: 'starter',
              modules: PLAN_MODULES.starter,
            },
            { merge: true },
          );
          emailsSent += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown tenant processing error';
        errors.push(`tenant:${tenantId} ${message}`);
      }
    }

    if (errors.length === 0) {
      if (truncated && tenantDocs.length > 0) {
        await cursorRef.set({
          lastTenantId: tenantDocs[tenantDocs.length - 1].id,
          updatedAt: new Date(),
        });
      } else {
        await cursorRef.delete().catch(() => undefined);
      }
    }

    return NextResponse.json(
      {
        ok: errors.length === 0,
        blocked: errors.length === 0 && truncated,
        processedTenants: tenantDocs.length,
        emailsSent,
        errors,
        truncated,
      },
      { status: errors.length === 0 ? 200 : 500 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, processedTenants: 0, emailsSent, errors: [...errors, message] },
      { status: 500 },
    );
  }
}
