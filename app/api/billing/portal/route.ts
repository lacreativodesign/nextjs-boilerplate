import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/payments/stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { getAppUrl } from '@/lib/urls';

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

    const snap = await adminDb.collection('tenants').doc(tenantId).get();
    const tenant = snap.data();

    if (!tenant?.stripeCustomerId) {
      return NextResponse.json(
        { ok: false, error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    // P0-4b: fell back to the marketing site, so a customer returning from the Stripe
    // billing portal landed on a 404 instead of their billing page.
    const appUrl = getAppUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[BILLING] Portal session error:', message);
    return NextResponse.json(
      { ok: false, error: 'Failed to open billing portal' },
      { status: 500 },
    );
  }
}
