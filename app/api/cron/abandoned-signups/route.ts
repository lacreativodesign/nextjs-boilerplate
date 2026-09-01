import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { sendAbandonedSignupReminderEmail } from '@/lib/email/onboarding-emails';
import {
  classifyAbandonedTenant,
  deletionDateIso,
  type AbandonedTenantInput,
} from '@/lib/tenant/abandoned-signups';

export const runtime = 'nodejs';

/**
 * Abandoned-signup lifecycle cron. Classification rules, timeline, and hard
 * safety guards live in lib/tenant/abandoned-signups.ts (route files must only
 * export handlers and route-segment config — Next.js build validates this).
 */

function isAuthorized(request: NextRequest) {
  // SOC2 F-04: this previously short-circuited on the `x-vercel-cron` request header
  // before checking CRON_SECRET. That header is client-supplied, so any caller able to
  // reach this handler could assert it and run the job. Vercel Cron sends
  // `Authorization: Bearer $CRON_SECRET` whenever CRON_SECRET is set, so the Bearer
  // check alone is sufficient and matches the other eight cron routes.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
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
    // S38: provisioned-but-unpaid tenants sit in 'pending_checkout'; legacy signups used 'trial'.
    // Scan both so neither cohort leaks past the 30-day abandonment window.
    const trialSnap = await adminDb
      .collection('tenants')
      .where('subscriptionState', 'in', ['pending_checkout', 'trial'])
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
