import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { toIsoCountryCode, updateStripeCustomerAddress } from '@/lib/stripe/customer';

export const runtime = 'nodejs';

type BillingAddressBody = {
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
};

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as BillingAddressBody;
    const country = String(body.country || '').trim();
    const state = String(body.state || '').trim();
    const city = String(body.city || '').trim();
    const postalCode = String(body.postalCode || '').trim();

    if (!country) {
      return NextResponse.json({ ok: false, error: 'country is required' }, { status: 400 });
    }

    const isoCountry = toIsoCountryCode(country);

    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    const tenantData = tenantSnap.data() || {};
    const stripeCustomerId = String(tenantData.stripeCustomerId || '').trim();

    if (stripeCustomerId) {
      await updateStripeCustomerAddress(stripeCustomerId, {
        country: isoCountry,
        state: state || undefined,
        city: city || undefined,
        postalCode: postalCode || undefined,
      });
    }

    await tenantRef.set(
      {
        settings: {
          ...(tenantData.settings || {}),
          country: isoCountry,
          state: state || '',
          city: city || '',
          postalCode: postalCode || '',
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, message: 'Billing address updated' });
  } catch (error) {
    console.error('[BILLING] Failed to update billing address', error);
    return NextResponse.json({ ok: false, error: 'Unable to update billing address' }, { status: 500 });
  }
}
