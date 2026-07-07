import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { applyLockAdvance, classifyLockAdvance } from '@/lib/billing/apply-subscription-state';
import { executeDuePendingDowngrades } from '@/lib/billing/pending-downgrade';

export const runtime = 'nodejs';

/**
 * Daily dunning lock-ladder cron. applyPaymentFailed stamps softLockAt (day 8)
 * and hardLockAt (day 21) when a failed-payment ladder starts; this cron
 * advances subscriptionState when those dates pass. All transitions go through
 * the canonical billing state service (applyLockAdvance), which re-checks the
 * tenant inside a transaction and writes a billing_state_audit record, so a
 * payment that succeeds between read and write can never be overwritten.
 */

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isCronFromVercel =
    process.env.VERCEL === '1' && request.headers.get('x-vercel-cron') === '1';

  if (isCronFromVercel) return true;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const errors: string[] = [];
  let softLocked = 0;
  let hardLocked = 0;
  const nowMs = Date.now();

  try {
    const snap = await adminDb
      .collection('tenants')
      .where('billingStatus', '==', 'past_due')
      .limit(500)
      .get();

    for (const tenantDoc of snap.docs) {
      const tenantId = tenantDoc.id;
      try {
        const data = tenantDoc.data() as Record<string, unknown>;
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

    return NextResponse.json({
      ok: true,
      softLocked,
      hardLocked,
      downgradesApplied: downgrades.applied,
      errors,
    });
  } catch (err: any) {
    console.error('billing-locks cron error:', err?.message || err);
    return NextResponse.json(
      { ok: false, softLocked, hardLocked, errors: [...errors, err?.message || 'unknown'] },
      { status: 500 },
    );
  }
}
