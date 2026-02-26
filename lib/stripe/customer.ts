import type Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';

export async function getOrCreateStripeCustomer(
  tenantId: string,
  email: string,
  name: string,
): Promise<string> {
  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  const tenantData = tenantSnap.data() || {};

  const existingCustomerId =
    typeof tenantData.stripeCustomerId === 'string' ? tenantData.stripeCustomerId : '';
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { tenantId },
  });

  await tenantRef.set(
    {
      stripeCustomerId: customer.id,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return customer.id;
}

export async function getStripeSubscription(tenantId: string): Promise<Stripe.Subscription | null> {
  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  const subscriptionId =
    typeof tenantSnap.data()?.stripeSubscriptionId === 'string'
      ? tenantSnap.data()?.stripeSubscriptionId
      : '';
  if (!subscriptionId) {
    return null;
  }

  try {
    const stripe = getStripeClient();
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error('[BILLING] Failed to retrieve Stripe subscription', {
      tenantId,
      subscriptionId,
      error,
    });
    return null;
  }
}

export async function cancelStripeSubscription(tenantId: string): Promise<void> {
  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  const subscriptionId =
    typeof tenantSnap.data()?.stripeSubscriptionId === 'string'
      ? tenantSnap.data()?.stripeSubscriptionId
      : '';

  if (!subscriptionId) {
    return;
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

  await tenantRef.set(
    {
      cancelAtPeriodEnd: true,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}
