import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { sendAbandonedSignupReminderEmail } from '@/lib/email/onboarding-emails';

export const runtime = 'nodejs';

/**
 * Abandoned-signup lifecycle (locked founder decision):
 * a tenant that verified its email and was provisioned, but never started a
 * subscription, receives 2 reminder emails and is permanently deleted 30 days
 * after signup. Trial nurture emails (days 1–14) live in /api/cron/trial-emails;
 * this cron only covers the post-trial abandonment window.
 *
 * Timeline from tenant createdAt:
 *   day 18 → first reminder
 *   day 25 → final reminder (deletion notice)
 *   day 30 → tenant deleted (Auth users + user docs + tenant tree)
 *
 * Hard safety guards — a tenant is NEVER touched if any of these hold:
 *   - it is a protected platform tenant (bizosto, bizosto-demo)
 *   - it has a stripeSubscriptionId or stripeCustomerId
 *   - billingStatus is 'active' or subscriptionState is not 'trial'
 */

const PROTECTED_TENANTS = new Set(['bizosto', 'bizosto-demo']);

const FIRST_REMINDER_DAY = 18;
const FINAL_REMINDER_DAY = 25;
const DELETE_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AbandonedAction = 'skip' | 'none' | 'remind_first' | 'remind_final' | 'delete';

export interface AbandonedTenantInput {
  tenantId: string;
  createdAt?: string;
  subscriptionState?: string;
  billingStatus?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  firstReminderSentAt?: string;
  finalReminderSentAt?: string;
}

export function classifyAbandonedTenant(
  input: AbandonedTenantInput,
  nowMs: number,
): AbandonedAction {
  if (PROTECTED_TENANTS.has(input.tenantId)) return 'skip';
  if (input.stripeSubscriptionId || input.stripeCustomerId) return 'skip';
  if (String(input.billingStatus || '').toLowerCase() === 'active') return 'skip';
  if (String(input.subscriptionState || '') !== 'trial') return 'skip';

  const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  if (!Number.isFinite(createdMs)) return 'skip';

  const ageDays = (nowMs - createdMs) / DAY_MS;
  if (ageDays >= DELETE_DAY) return 'delete';
  if (ageDays >= FINAL_REMINDER_DAY) return input.finalReminderSentAt ? 'none' : 'remind_final';
  if (ageDays >= FIRST_REMINDER_DAY) return input.firstReminderSentAt ? 'none' : 'remind_first';
  return 'none';
}

export function deletionDateIso(createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + DELETE_DAY * DAY_MS).toISOString();
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isCronFromVercel =
    process.env.VERCEL === '1' && request.headers.get('x-vercel-cron') === '1';

  if (isCronFromVercel) return true;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

async function findTenantAdmin(tenantId: string) {
  const snap = await adminDb
    .collection('users')
    .where('tenantId', '==', tenantId)
    .where('role', '==', 'admin')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const data = snap.docs[0].data() as { email?: string; displayName?: string };
  return data.email ? { email: data.email, name: data.displayName || 'there' } : null;
}

async function deleteAbandonedTenant(tenantId: string) {
  // Evidence record written BEFORE any destructive step, so a partial failure
  // still leaves an audit trail of what was attempted and why.
  await adminDb.collection('abandoned_signup_deletions').doc(tenantId).set({
    tenantId,
    reason: 'abandoned_signup_30_days_unpaid',
    deletedAt: new Date().toISOString(),
  });

  const usersSnap = await adminDb
    .collection('users')
    .where('tenantId', '==', tenantId)
    .limit(500)
    .get();

  for (const userDoc of usersSnap.docs) {
    try {
      await adminAuth.deleteUser(userDoc.id);
    } catch (authErr: any) {
      if (authErr?.code !== 'auth/user-not-found') throw authErr;
    }
    await userDoc.ref.delete();
  }

  await adminDb.recursiveDelete(adminDb.collection('tenants').doc(tenantId));
  await adminDb.collection('scheduled_emails').doc(tenantId).delete();
  await adminDb.collection('abandoned_signup_reminders').doc(tenantId).delete();
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const errors: string[] = [];
  let remindersSent = 0;
  let deleted = 0;
  const nowMs = Date.now();

  try {
    const trialSnap = await adminDb
      .collection('tenants')
      .where('subscriptionState', '==', 'trial')
      .limit(500)
      .get();

    for (const tenantDoc of trialSnap.docs) {
      const tenantId = tenantDoc.id;
      try {
        const tenantData = tenantDoc.data() as Omit<AbandonedTenantInput, 'tenantId'>;

        const reminderRef = adminDb.collection('abandoned_signup_reminders').doc(tenantId);
        const reminderSnap = await reminderRef.get();
        const reminderState = (reminderSnap.data() || {}) as {
          firstReminderSentAt?: string;
          finalReminderSentAt?: string;
        };

        const action = classifyAbandonedTenant(
          { ...tenantData, ...reminderState, tenantId },
          nowMs,
        );

        if (action === 'skip' || action === 'none') continue;

        if (action === 'delete') {
          await deleteAbandonedTenant(tenantId);
          deleted += 1;
          continue;
        }

        const owner = await findTenantAdmin(tenantId);
        if (!owner) {
          errors.push(`tenant:${tenantId} missing admin user for reminder`);
          continue;
        }

        const deleteAt = deletionDateIso(String(tenantData.createdAt));
        const variant = action === 'remind_final' ? 'final' : 'first';
        await sendAbandonedSignupReminderEmail(
          owner.email,
          owner.name,
          tenantId,
          variant,
          deleteAt,
        );
        await reminderRef.set(
          variant === 'final'
            ? { finalReminderSentAt: new Date().toISOString() }
            : { firstReminderSentAt: new Date().toISOString() },
          { merge: true },
        );
        remindersSent += 1;
      } catch (tenantErr: any) {
        errors.push(`tenant:${tenantId} ${tenantErr?.message || 'failed'}`);
      }
    }

    return NextResponse.json({ ok: true, remindersSent, deleted, errors });
  } catch (err: any) {
    console.error('abandoned-signups cron error:', err?.message || err);
    return NextResponse.json(
      { ok: false, remindersSent, deleted, errors: [...errors, err?.message || 'unknown'] },
      { status: 500 },
    );
  }
}
