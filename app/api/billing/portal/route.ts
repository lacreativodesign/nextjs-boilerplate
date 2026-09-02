import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/payments/stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { AuditLogger } from '@/lib/audit/audit-logger';
import { isComped } from '@/lib/billing/billing-mode';
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

    // COMP-3: a comped workspace has no billing relationship to manage. A tenant that was
    // converted from paying keeps its stripeCustomerId, so without this the Stripe portal
    // still opens and an admin can change payment details or cancel a subscription that
    // Bizosto is no longer treating as billable.
    if (isComped(tenant)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This workspace is managed by Bizosto and is not billed through Stripe. Contact support to change your billing arrangement.',
          code: 'billing_comped',
        },
        { status: 409 },
      );
    }

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

    // SOC2 F-05: inside the Stripe portal an admin can cancel the subscription, swap
    // the card and change the billing address — none of which comes back through this
    // application, so none of it reaches this trail. Minting the session is therefore
    // the only record that the capability was handed over, and it is what explains a
    // later state change that appears to have no actor behind it.
    //
    // session.url is NOT logged: it is a bearer link that grants billing management to
    // anyone holding it, and the trail is not the place to store one.
    await AuditLogger.log({
      tenantId,
      userId: auth.user.uid,
      userEmail: String(auth.user.email || ''),
      userName: String(auth.user.name || auth.user.email || auth.user.uid),
      action: 'create',
      resource: 'subscription',
      resourceId: tenantId,
      changes: [{ field: 'billingPortalSession', oldValue: null, newValue: 'created' }],
      status: 'success',
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
