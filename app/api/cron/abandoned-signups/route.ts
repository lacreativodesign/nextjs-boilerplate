import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { sendAbandonedSignupReminderEmail } from '@/lib/email/onboarding-emails';
import {
  classifyAbandonedTenant,
  deletionDateIso,
  type AbandonedTenantInput,
} from '@/lib/tenant/abandoned-signups';
import { authorizeCronRequest } from '@/lib/cron/auth';

export const runtime = 'nodejs';

const configuredTenantBatchSize = Number(process.env.DAILY_ABANDONED_SIGNUP_TENANT_BATCH_SIZE || 5);
const TENANT_BATCH_SIZE = Number.isFinite(configuredTenantBatchSize)
  ? Math.min(25, Math.max(1, Math.floor(configuredTenantBatchSize)))
  : 5;

/**
 * Abandoned-signup lifecycle cron. Classification rules, timeline, and hard
 * safety guards live in lib/tenant/abandoned-signups.ts (route files must only
 * export handlers and route-segment config — Next.js build validates this).
 */

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
  const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.code },
      { status: authorization.status },
    );
  }

  const errors: string[] = [];
  let remindersSent = 0;
  let deleted = 0;
  const nowMs = Date.now();

  try {
    // Scan a bounded, rotating tenant page. Filtering after the read avoids a composite
    // index dependency and prevents the same earliest unpaid records from starving later
    // tenants across daily invocations.
    const cursorRef = adminDb.collection('cron_job_cursors').doc('abandoned-signups');
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
        const tenantData = tenantDoc.data() as Omit<AbandonedTenantInput, 'tenantId'>;
        // S38: provisioned-but-unpaid tenants sit in pending_checkout; legacy signups
        // used trial. Other lifecycle states are never candidates for deletion.
        if (!['pending_checkout', 'trial'].includes(String(tenantData.subscriptionState || ''))) {
          continue;
        }

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
        scanned: tenantDocs.length,
        remindersSent,
        deleted,
        errors,
        truncated,
      },
      { status: errors.length === 0 ? 200 : 500 },
    );
  } catch (err: any) {
    console.error('abandoned-signups cron error:', err?.message || err);
    return NextResponse.json(
      { ok: false, remindersSent, deleted, errors: [...errors, err?.message || 'unknown'] },
      { status: 500 },
    );
  }
}
