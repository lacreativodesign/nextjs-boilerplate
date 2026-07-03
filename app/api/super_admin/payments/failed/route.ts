import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FailedPaymentTenant = {
  tenantId: string;
  tenantName: string;
  plan: string;
  subscriptionState: string;
  lastPaymentAt: string | null;
  stripeCustomerId: string | null;
  trialEndsAt: string | null;
};

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const [pastDueSnap, lockedSnap] = await Promise.all([
      adminDb.collection('tenants').where('billingStatus', '==', 'past_due').get(),
      adminDb
        .collection('tenants')
        .where('subscriptionState', 'in', ['grace', 'soft_locked'])
        .get(),
    ]);

    const byId = new Map<string, FailedPaymentTenant>();
    [pastDueSnap, lockedSnap].forEach((snap) => {
      snap.docs.forEach((doc) => {
        const data = doc.data() || {};
        byId.set(doc.id, {
          tenantId: doc.id,
          tenantName: String(data.name || doc.id),
          plan: String(data.plan || 'trial'),
          subscriptionState: String(data.subscriptionState || 'grace'),
          lastPaymentAt: data.lastPaymentAt ? String(data.lastPaymentAt) : null,
          stripeCustomerId: data.stripeCustomerId ? String(data.stripeCustomerId) : null,
          trialEndsAt: data.trialEndsAt ? String(data.trialEndsAt) : null,
        });
      });
    });

    const failedPayments = Array.from(byId.values());
    return NextResponse.json({ ok: true, failedPayments, count: failedPayments.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
