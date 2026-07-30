import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { writeAuditLog } from '@/lib/tenant/audit';
import { disconnectConnectAccount } from '@/lib/stripe/connect';
import { requireTenantStripeConnect } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const auth = await requireTenantStripeConnect();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || '');
    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    const tenantData = tenantSnap.data() || {};
    const accountId =
      typeof tenantData.stripeConnectAccountId === 'string'
        ? tenantData.stripeConnectAccountId
        : '';

    if (!accountId) {
      return NextResponse.json(
        { ok: false, error: 'No Stripe account connected' },
        { status: 400 },
      );
    }

    await disconnectConnectAccount(accountId);

    const now = new Date().toISOString();
    await tenantRef.set(
      {
        stripeConnectAccountId: null,
        stripeConnectStatus: 'disconnected',
        stripeConnectEmail: null,
        stripeConnectBusinessName: null,
        stripeConnectConnectedAt: null,
        stripeConnectChargesEnabled: false,
        stripeConnectPayoutsEnabled: false,
        updatedAt: now,
      },
      { merge: true },
    );

    await writeAuditLog({
      tenantId,
      actorUserId: auth.user.uid,
      actionType: 'stripe_connect_disconnected',
      entityType: 'stripe_connect',
      entityId: accountId,
      metadata: { accountId },
    });

    return NextResponse.json({ ok: true, message: 'Stripe account disconnected' });
  } catch (error: any) {
    const message = error?.message || 'Unable to disconnect Stripe account.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
