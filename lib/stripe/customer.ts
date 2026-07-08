import type Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';

const COUNTRY_TO_ISO: Record<string, string> = {
  'United States': 'US',
  'United Kingdom': 'GB',
  Canada: 'CA',
  Australia: 'AU',
  'United Arab Emirates': 'AE',
  'Saudi Arabia': 'SA',
  Pakistan: 'PK',
  India: 'IN',
  Germany: 'DE',
  France: 'FR',
  Spain: 'ES',
  Netherlands: 'NL',
  Singapore: 'SG',
  'South Africa': 'ZA',
  Nigeria: 'NG',
  Kenya: 'KE',
  Brazil: 'BR',
  Mexico: 'MX',
  Japan: 'JP',
  Other: 'US',
};

type StripeCustomerAddressInput = {
  country: string;
  state?: string;
  city?: string;
  postalCode?: string;
  line1?: string;
};

export function toIsoCountryCode(country: string): string {
  const normalizedCountry = String(country || '').trim();
  if (!normalizedCountry) {
    return 'US';
  }

  const mapped = COUNTRY_TO_ISO[normalizedCountry];
  if (mapped) {
    return mapped;
  }

  if (normalizedCountry.length === 2) {
    return normalizedCountry.toUpperCase();
  }

  return 'US';
}

function normalizeStripeAddress(address: StripeCustomerAddressInput): Stripe.AddressParam {
  return {
    country: toIsoCountryCode(address.country),
    state: address.state || undefined,
    city: address.city || undefined,
    postal_code: address.postalCode || undefined,
    line1: address.line1 || 'N/A',
  };
}

export async function getOrCreateStripeCustomer(
  tenantId: string,
  email: string,
  name: string,
  address?: StripeCustomerAddressInput,
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
  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create({
      email,
      name,
      metadata: { tenantId },
      address: address ? normalizeStripeAddress(address) : undefined,
    });
  } catch (error) {
    console.error('[BILLING] Failed to create Stripe customer', {
      tenantId,
      email,
      error,
    });
    throw error;
  }

  await tenantRef.set(
    {
      stripeCustomerId: customer.id,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return customer.id;
}

export async function updateStripeCustomerAddress(
  customerId: string,
  address: StripeCustomerAddressInput,
): Promise<void> {
  const stripe = getStripeClient();
  try {
    await stripe.customers.update(customerId, {
      address: normalizeStripeAddress(address),
    });
  } catch (error) {
    console.error('[BILLING] Failed to update Stripe customer address', {
      customerId,
      error,
    });
  }
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
