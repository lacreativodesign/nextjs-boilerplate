import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { cancelStripeSubscription } from '@/lib/stripe/customer';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

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

    await cancelStripeSubscription(tenantId);

    await adminDb.collection('tenants').doc(tenantId).set(
      {
        cancelAtPeriodEnd: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    try {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
      const tenantName = String(tenantSnap.data()?.name || tenantSnap.data()?.companyName || tenantId);
      const platformAdmins = await getUsersByRoles(["super_admin"], DEFAULT_TENANT_ID);
      await createNotifications({
        recipients: platformAdmins,
        tenantId: DEFAULT_TENANT_ID,
        type: "warning",
        title: "Subscription cancellation scheduled",
        message: `${tenantName} scheduled cancellation of their subscription.`,
        entityType: "subscription",
        entityId: tenantId,
        deepLink: "/super_admin/tenants",
      });
    } catch (notifyError) {
      console.error("billing.cancel platform notify error:", notifyError);
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
