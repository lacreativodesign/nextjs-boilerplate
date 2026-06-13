import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripePriceId } from '@/lib/billing/plans';
import { getStripeClient } from '@/lib/payments/stripe';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { PLAN_MODULES } from '@/app/config/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChangeBody = {
  plan?: string;
};

const VALID_PLANS = new Set(['starter', 'pro', 'enterprise']);

async function handlePlanChange(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as ChangeBody;
    const newPlan = String(body.plan || '')
      .trim()
      .toLowerCase();
    if (!VALID_PLANS.has(newPlan)) {
      return NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 });
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    const subscriptionId = String(tenantSnap.data()?.stripeSubscriptionId || '').trim();

    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: 'No active subscription found' },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json(
        { ok: false, error: 'No active subscription found' },
        { status: 400 },
      );
    }

    const newPriceId = getStripePriceId(newPlan as 'starter' | 'pro' | 'enterprise');
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'always_invoice',
      metadata: { tenantId, plan: newPlan },
    });

    await tenantRef.set(
      {
        plan: newPlan,
        // Re-derive module access from the new plan so a downgrade actually
        // revokes paid modules (modules is authoritative in resolveTenantModules).
        modules: PLAN_MODULES[newPlan as keyof typeof PLAN_MODULES],
        modulesEnabled: PLAN_MODULES[newPlan as keyof typeof PLAN_MODULES],
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, plan: newPlan });
  } catch (error) {
    console.error('[BILLING] Failed to change subscription plan', error);
    return NextResponse.json({ ok: false, error: 'Unable to change plan' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handlePlanChange(req);
}

export async function PUT(req: Request) {
  return handlePlanChange(req);
}
