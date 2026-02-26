import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};

    const email = String(tenantData.email || auth.user.email || '').trim();
    const name = String(
      tenantData.name || auth.user.displayName || auth.user.name || tenantId,
    ).trim();
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Tenant email is required' }, { status: 400 });
    }

    const customerId = await getOrCreateStripeCustomer(tenantId, email, name);

    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: { tenantId },
    });

    return NextResponse.json({ ok: true, clientSecret: setupIntent.client_secret, customerId });
  } catch (error) {
    console.error('[BILLING] Failed to create setup intent', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to create setup intent' },
      { status: 500 },
    );
  }
}
