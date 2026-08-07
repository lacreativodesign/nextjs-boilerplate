import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { getStripePriceIdForCycle, getSubscriptionBillingCycle } from '@/lib/billing/stripe-prices';
import {
  applySubscriptionState,
  clearPendingDowngrade,
  isKnownPaidTier,
  type PaidTier,
} from '@/lib/billing/apply-subscription-state';

/**
 * Executes period-end downgrades scheduled by the subscription change route
 * (locked decision: upgrades immediate + prorated, downgrades at period end).
 *
 * The change route already swapped the Stripe price with proration_behavior
 * 'none' when the downgrade was scheduled, so the renewal invoice bills the
 * lower price even if this cron lags. This executor's job is entitlement: once
 * pendingDowngradeAt passes it stamps bizosto_plan metadata to the new tier and
 * applies plan/modules/limits through the canonical billing state service.
 */

export interface PendingDowngradeResult {
  applied: boolean;
  cleared: boolean;
  error?: string;
}

export async function executePendingDowngradeForTenant(
  tenantId: string,
): Promise<PendingDowngradeResult> {
  const snap = await adminDb.collection('tenants').doc(tenantId).get();
  if (!snap.exists) return { applied: false, cleared: false, error: 'tenant not found' };
  const data = (snap.data() || {}) as Record<string, unknown>;

  const plan = String(data.pendingDowngradePlan || '').trim();
  const subscriptionId = String(data.stripeSubscriptionId || '').trim();

  if (!isKnownPaidTier(plan) || !subscriptionId) {
    await clearPendingDowngrade({
      tenantId,
      actorUid: 'system',
      reason: 'Pending downgrade invalid — cleared without applying',
    });
    return { applied: false, cleared: true };
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  // Keep the subscription on its existing billing cycle when re-asserting the price.
  const billingCycle = getSubscriptionBillingCycle(subscription);

  if (subscription.status === 'canceled') {
    // Subscription ended before the downgrade date; nothing to apply.
    await clearPendingDowngrade({
      tenantId,
      actorUid: 'system',
      reason: 'Subscription canceled before scheduled downgrade',
    });
    return { applied: false, cleared: true };
  }

  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    return { applied: false, cleared: false, error: 'subscription has no items' };
  }

  // Price was already swapped at scheduling time; re-assert it defensively and
  // move bizosto_plan metadata to the new tier so webhook-driven state agrees.
  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: getStripePriceIdForCycle(plan as PaidTier, billingCycle) }],
    proration_behavior: 'none',
    metadata: { tenantId, bizosto_plan: plan, bizosto_pending_plan: '' },
  });

  await applySubscriptionState({
    tenantId,
    source: 'subscription.updated',
    plan,
    stripeStatus: updated.status,
    stripeSubscriptionId: subscriptionId,
    currentPeriodEnd: updated.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
  });

  await clearPendingDowngrade({
    tenantId,
    actorUid: 'system',
    reason: 'Downgrade applied at period end',
  });

  return { applied: true, cleared: true };
}

export interface PendingDowngradeRunResult {
  applied: number;
  cleared: number;
  errors: string[];
}

export async function executeDuePendingDowngrades(
  nowIso = new Date().toISOString(),
): Promise<PendingDowngradeRunResult> {
  const errors: string[] = [];
  let applied = 0;
  let cleared = 0;

  const snap = await adminDb
    .collection('tenants')
    .where('pendingDowngradeAt', '<=', nowIso)
    .limit(100)
    .get();

  for (const doc of snap.docs) {
    try {
      const result = await executePendingDowngradeForTenant(doc.id);
      if (result.applied) applied += 1;
      if (result.cleared) cleared += 1;
      if (result.error) errors.push(`tenant:${doc.id} ${result.error}`);
    } catch (err) {
      errors.push(`tenant:${doc.id} ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  return { applied, cleared, errors };
}
