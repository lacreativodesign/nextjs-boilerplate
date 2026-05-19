import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { cancelStripeSubscription } from '@/lib/stripe/customer';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.cancel_at_period_end !== true) {
      return NextResponse.json(
        { ok: false, error: 'cancel_at_period_end must be true' },
        { status: 400 },
      );
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    await cancelStripeSubscription(tenantId);

    await adminDb.collection('tenants').doc(tenantId).set(
      {
        cancelAtPeriodEnd: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[BILLING] Failed to schedule subscription cancellation', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to cancel subscription' },
      { status: 500 },
    );
  }
}
