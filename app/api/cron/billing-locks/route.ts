import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { applyLockAdvance, classifyLockAdvance } from '@/lib/billing/apply-subscription-state';
import { executeDuePendingDowngrades } from '@/lib/billing/pending-downgrade';
import { isComped } from '@/lib/billing/billing-mode';
import { authorizeCronRequest } from '@/lib/cron/auth';

export const runtime = 'nodejs';

const configuredTenantBatchSize = Number(process.env.DAILY_BILLING_TENANT_BATCH_SIZE || 25);
const TENANT_BATCH_SIZE = Number.isFinite(configuredTenantBatchSize)
  ? Math.min(100, Math.max(1, Math.floor(configuredTenantBatchSize)))
  : 25;

/**
 * Daily dunning lock-ladder cron. applyPaymentFailed stamps softLockAt (day 8)
 * and hardLockAt (day 21) when a failed-payment ladder starts; this cron
 * advances subscriptionState when those dates pass. All transitions go through
 * the canonical billing state service (applyLockAdvance), which re-checks the
 * tenant inside a transaction and writes a billing_state_audit record, so a
 * payment that succeeds between read and write can never be overwritten.
 */

export async function GET(request: NextRequest) {
  const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.code },
      { status: authorization.status },
    );
  }

  const errors: string[] = [];
  let softLocked = 0;
  let hardLocked = 0;
  let compedSkipped = 0;
  const nowMs = Date.now();

  try {
    const cursorRef = adminDb.collection('cron_job_cursors').doc('billing-locks');
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
    const tenants = tenantPage.docs.slice(0, TENANT_BATCH_SIZE);
    const truncated = tenantPage.size > TENANT_BATCH_SIZE;

    for (const tenantDoc of tenants) {
      const tenantId = tenantDoc.id;
      try {
        const data = tenantDoc.data() as Record<string, unknown>;
        if (data.billingStatus !== 'past_due') continue;

        // COMP-1: the dunning ladder exists to chase a failed payment. A comped workspace
        // has no payment to fail, so a stale past_due flag left over from a previous paid
        // period would otherwise soft-lock and then hard-lock an account Bizosto has
        // deliberately chosen not to bill.
        if (isComped(data)) {
          compedSkipped += 1;
          continue;
        }

        const advance = classifyLockAdvance(
          {
            tenantId,
            subscriptionState: String(data.subscriptionState || ''),
            billingStatus: String(data.billingStatus || ''),
            softLockAt: (data.softLockAt as string | null) ?? null,
            hardLockAt: (data.hardLockAt as string | null) ?? null,
          },
          nowMs,
        );
        if (advance === 'none') continue;

        const result = await applyLockAdvance({ tenantId, to: advance });
        if (result.ok) {
          if (advance === 'hard_locked') hardLocked += 1;
          else softLocked += 1;
        }
      } catch (tenantErr: any) {
        errors.push(`tenant:${tenantId} ${tenantErr?.message || 'failed'}`);
      }
    }

    // Apply period-end downgrades whose effective date has passed (locked
    // decision: downgrades take effect at period end via the canonical service).
    const downgrades = await executeDuePendingDowngrades();
    errors.push(...downgrades.errors);

    if (errors.length === 0) {
      if (truncated && tenants.length > 0) {
        await cursorRef.set({
          lastTenantId: tenants[tenants.length - 1].id,
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
        scanned: tenants.length,
        softLocked,
        hardLocked,
        compedSkipped,
        downgradesApplied: downgrades.applied,
        errors,
        truncated,
      },
      { status: errors.length === 0 ? 200 : 500 },
    );
  } catch (err: any) {
    console.error('billing-locks cron error:', err?.message || err);
    return NextResponse.json(
      { ok: false, softLocked, hardLocked, errors: [...errors, err?.message || 'unknown'] },
      { status: 500 },
    );
  }
}
