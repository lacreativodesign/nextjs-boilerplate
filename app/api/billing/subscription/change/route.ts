import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripePriceIdForCycle, getSubscriptionBillingCycle } from '@/lib/billing/stripe-prices';
import { getStripeClient } from '@/lib/payments/stripe';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { isComped } from '@/lib/billing/billing-mode';
import {
  applySubscriptionState,
  clearPendingDowngrade,
  schedulePendingDowngrade,
  isKnownPaidTier,
  type PaidTier,
} from '@/lib/billing/apply-subscription-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChangeBody = {
  plan?: string;
};

const PLAN_RANK: Record<PaidTier, number> = { starter: 1, pro: 2, enterprise: 3 };

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
    if (!isKnownPaidTier(newPlan)) {
      return NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 });
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    // SOC2 F-05: passed into the canonical billing service so the trail entry names
    // the admin who changed the plan. Omitting it would attribute a human plan change
    // to the machine path, which is how Stripe- and cron-driven changes are recorded.
    const actor = {
      userId: auth.user.uid,
      userEmail: String(auth.user.email || ''),
      userName: String(auth.user.name || auth.user.email || auth.user.uid),
    };

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};

    // COMP-3: a comped workspace is not billed through Stripe, so there is no subscription
    // for a tenant admin to cancel or change here. A workspace converted from paying keeps
    // its stripeSubscriptionId, which is exactly the case this catches.
    if (isComped(tenantData)) {
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

    const subscriptionId = String(tenantData.stripeSubscriptionId || '').trim();
    const currentPlan = String(tenantData.plan || '')
      .trim()
      .toLowerCase();
    const pendingDowngradePlan = String(tenantData.pendingDowngradePlan || '').trim();

    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: 'No active subscription found' },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    // Preserve the subscription's existing billing cycle across the plan change so an
    // annual subscriber is never silently switched to monthly pricing (and vice versa).
    const billingCycle = getSubscriptionBillingCycle(subscription);
    if (!itemId) {
      return NextResponse.json(
        { ok: false, error: 'No active subscription found' },
        { status: 400 },
      );
    }

    if (newPlan === currentPlan) {
      if (pendingDowngradePlan) {
        // Choosing the current plan again cancels the scheduled downgrade:
        // restore the current plan's Stripe price (it was swapped at scheduling
        // time) and clear the pending marker through the canonical service.
        await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: itemId, price: getStripePriceIdForCycle(newPlan, billingCycle) }],
          proration_behavior: 'none',
          metadata: { tenantId, bizosto_plan: newPlan, bizosto_pending_plan: '' },
        });
        await clearPendingDowngrade({
          tenantId,
          actorUid: auth.user.uid,
          actor,
          reason: 'Scheduled downgrade cancelled by tenant admin',
        });
        return NextResponse.json({
          ok: true,
          plan: newPlan,
          message: 'Scheduled downgrade cancelled',
        });
      }
      return NextResponse.json({ ok: false, error: 'Already on this plan' }, { status: 400 });
    }

    const newPriceId = getStripePriceIdForCycle(newPlan, billingCycle);
    const currentRank = isKnownPaidTier(currentPlan) ? PLAN_RANK[currentPlan] : 0;
    const isUpgrade = PLAN_RANK[newPlan] > currentRank;

    if (isUpgrade) {
      // Upgrade: immediate + prorated (locked decision). Entitlement is applied
      // through the canonical billing state service — no direct tenant writes.
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: 'always_invoice',
        metadata: { tenantId, bizosto_plan: newPlan, bizosto_pending_plan: '' },
      });

      await applySubscriptionState({
        tenantId,
        source: 'subscription.updated',
        plan: newPlan,
        stripeStatus: updated.status,
        stripeSubscriptionId: subscriptionId,
        currentPeriodEnd: updated.current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
        actor,
      });

      if (pendingDowngradePlan) {
        await clearPendingDowngrade({
          tenantId,
          actorUid: auth.user.uid,
          actor,
          reason: 'Superseded by upgrade',
        });
      }

      return NextResponse.json({ ok: true, plan: newPlan, effective: 'immediate' });
    }

    // Downgrade: takes effect at period end (locked decision). Swap the Stripe
    // price now with proration_behavior 'none' so the NEXT invoice bills the
    // lower price even if the cron lags, but keep bizosto_plan metadata at the
    // CURRENT plan so webhook-driven state keeps today's entitlement until the
    // period ends. The billing cron applies the entitlement change once
    // pendingDowngradeAt passes.
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'none',
      metadata: {
        tenantId,
        bizosto_plan: isKnownPaidTier(currentPlan) ? currentPlan : newPlan,
        bizosto_pending_plan: newPlan,
      },
    });

    const effectiveAtIso =
      typeof updated.current_period_end === 'number'
        ? new Date(updated.current_period_end * 1000).toISOString()
        : new Date().toISOString();

    await schedulePendingDowngrade({
      tenantId,
      plan: newPlan,
      effectiveAtIso,
      actorUid: auth.user.uid,
      actor,
    });

    return NextResponse.json({
      ok: true,
      plan: currentPlan,
      pendingPlan: newPlan,
      effective: effectiveAtIso,
    });
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
