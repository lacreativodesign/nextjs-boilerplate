import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { applySubscriptionState } from '@/lib/billing/apply-subscription-state';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';
import { DEFAULT_TENANT_ID } from '@/lib/tenant/constants';

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
    const subscriptionId = String(tenantSnap.data()?.stripeSubscriptionId || '').trim();
    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: 'No active subscription found' },
        { status: 400 },
      );
    }

    // Cancel at period end (locked decision: access until period end, one-click
    // reactivate before then). State lands through the canonical billing
    // service — no direct tenant writes.
    const stripe = getStripeClient();
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    await applySubscriptionState({
      tenantId,
      source: 'subscription.updated',
      stripeStatus: updated.status,
      stripeSubscriptionId: subscriptionId,
      currentPeriodEnd: updated.current_period_end ?? null,
      cancelAtPeriodEnd: true,
    });

    try {
      const tenantName = String(
        tenantSnap.data()?.name || tenantSnap.data()?.companyName || tenantId,
      );
      const platformAdmins = await getUsersByRoles(['super_admin'], DEFAULT_TENANT_ID);
      await createNotifications({
        recipients: platformAdmins,
        tenantId: DEFAULT_TENANT_ID,
        type: 'warning',
        title: 'Subscription cancellation scheduled',
        message: `${tenantName} scheduled cancellation of their subscription.`,
        entityType: 'subscription',
        entityId: tenantId,
        deepLink: '/super_admin/tenants',
      });
    } catch (notifyError) {
      console.error('billing.cancel platform notify error:', notifyError);
    }

    return NextResponse.json({
      ok: true,
      message: 'Subscription will cancel at end of current billing period',
    });
  } catch (error) {
    console.error('[BILLING] Failed to cancel subscription', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to cancel subscription' },
      { status: 500 },
    );
  }
}
