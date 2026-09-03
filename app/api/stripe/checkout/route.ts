import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { isComped } from '@/lib/billing/billing-mode';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { getStripePriceId } from '@/lib/billing/stripe-prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INITIAL_TRIAL_DAYS = 14;

// One product per plan. Each has monthly + annual pricing.
const PLAN_CONFIGS = {
  starter_monthly: {
    plan: 'starter',
    billingCycle: 'monthly',
    amount: 7900,
    interval: 'month' as const,
    lookupKey: 'bizosto_starter_monthly',
    productName: 'Bizosto Starter',
  },
  starter_annual: {
    plan: 'starter',
    billingCycle: 'annual',
    amount: 79000,
    interval: 'year' as const,
    lookupKey: 'bizosto_starter_annual',
    productName: 'Bizosto Starter',
  },
  pro_monthly: {
    plan: 'pro',
    billingCycle: 'monthly',
    amount: 14900,
    interval: 'month' as const,
    lookupKey: 'bizosto_pro_monthly',
    productName: 'Bizosto Pro',
  },
  pro_annual: {
    plan: 'pro',
    billingCycle: 'annual',
    amount: 149000,
    interval: 'year' as const,
    lookupKey: 'bizosto_pro_annual',
    productName: 'Bizosto Pro',
  },
  enterprise_monthly: {
    plan: 'enterprise',
    billingCycle: 'monthly',
    amount: 29900,
    interval: 'month' as const,
    lookupKey: 'bizosto_enterprise_monthly',
    productName: 'Bizosto Enterprise',
  },
  enterprise_annual: {
    plan: 'enterprise',
    billingCycle: 'annual',
    amount: 299000,
    interval: 'year' as const,
    lookupKey: 'bizosto_enterprise_annual',
    productName: 'Bizosto Enterprise',
  },
} as const;

type PlanKey = keyof typeof PLAN_CONFIGS;

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return new Stripe(secretKey, { apiVersion: '2024-04-10' });
}

// Price IDs are fixed and read from env via getStripePriceId() — never created at runtime.

function resolveCheckoutUrl(value: unknown, fallback: string, allowedOrigin: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const url = new URL(value.trim());
    return url.origin === allowedOrigin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function parsePlanKey(value: unknown): PlanKey | null {
  if (typeof value !== 'string') return null;
  if (value in PLAN_CONFIGS) return value as PlanKey;

  const monthlyPlanKey = `${value}_monthly`;
  return monthlyPlanKey in PLAN_CONFIGS ? (monthlyPlanKey as PlanKey) : null;
}

async function resolveBillingEmail(tenantData: Record<string, any>, authUser: Record<string, any>) {
  const ownerId = String(tenantData.ownerId || '').trim();
  if (ownerId) {
    const ownerSnap = await adminDb.collection('users').doc(ownerId).get();
    const ownerEmail = String(ownerSnap.data()?.email || '')
      .trim()
      .toLowerCase();
    if (ownerEmail) return ownerEmail;
  }

  return String(authUser.email || '')
    .trim()
    .toLowerCase();
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const planKey = parsePlanKey(body?.plan);

    if (!planKey) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid plan. Valid values: ${Object.keys(PLAN_CONFIGS).join(', ')}`,
        },
        { status: 400 },
      );
    }

    // tenantId MUST come from the authenticated session, never the request body.
    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: 'No tenant is associated with this account.' },
        { status: 400 },
      );
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found.' }, { status: 404 });
    }
    const tenantData = tenantSnap.data() || {};

    // COMP-1: a comped workspace has no external payment relationship, so opening a
    // Checkout session for one would start charging a customer Bizosto has decided not to
    // charge — and would then contradict its own billingMode the moment the webhook
    // landed. Converting to paid billing is a Super Admin decision made on the tenant,
    // not something an admin can trigger by finding the upgrade button.
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

    // Prevent creating a SECOND Stripe subscription for a tenant that already has a
    // live one (active or past_due). Re-subscribing is only allowed after cancellation.
    const existingSubscriptionId = String(tenantData.stripeSubscriptionId || '').trim();
    const billingStatus = String(tenantData.billingStatus || '').toLowerCase();
    if (existingSubscriptionId && billingStatus !== 'canceled') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This account already has an active subscription. Change your plan instead of starting a new checkout.',
          code: 'subscription_exists',
        },
        { status: 409 },
      );
    }

    const config = PLAN_CONFIGS[planKey];
    const subscriptionState = String(tenantData.subscriptionState || '').toLowerCase();
    const isInitialCheckout = subscriptionState === 'pending_checkout';

    // TENANT-SAFETY PR2: during first activation the selected signup plan is server-owned.
    // A modified browser request must not be able to pay Starter while retaining Enterprise
    // entitlements (or vice versa). Later re-subscribe flows may intentionally select a new tier.
    if (isInitialCheckout) {
      const provisionedPlan = String(tenantData.plan || '').trim();
      if (provisionedPlan !== config.plan) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Checkout plan does not match the plan selected during signup.',
            code: 'signup_plan_mismatch',
          },
          { status: 409 },
        );
      }

      const currency = String(tenantData.settings?.currency || '')
        .trim()
        .toUpperCase();
      if (!currency) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Choose a workspace currency before starting checkout.',
            code: 'currency_required',
          },
          { status: 409 },
        );
      }
    }

    // Billing identity is server-owned. Never let the browser choose the Stripe customer email.
    const customerEmail = await resolveBillingEmail(tenantData, auth.user);
    if (!customerEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: 'A verified workspace owner email is required before checkout.',
          code: 'billing_email_required',
        },
        { status: 409 },
      );
    }

    // The free trial is a platform policy, not a request parameter. It is granted exactly once,
    // on the first pending_checkout activation. Re-subscriptions do not get a second free trial.
    const trialPeriodDays = isInitialCheckout ? INITIAL_TRIAL_DAYS : undefined;
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      new URL(req.url).origin ||
      'https://app.bizosto.com'
    ).replace(/\/$/, '');
    const successUrl = resolveCheckoutUrl(body?.successUrl, `${appUrl}/billing?upgraded=1`, appUrl);
    const cancelUrl = resolveCheckoutUrl(body?.cancelUrl, `${appUrl}/billing`, appUrl);
    const stripe = getStripeClient();
    const priceId = getStripePriceId(planKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: tenantId,
      customer_email: customerEmail,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      metadata: {
        bizosto_plan: config.plan,
        billingCycle: config.billingCycle,
        tenantId,
        source: 'bizosto_app',
      },
      subscription_data: {
        trial_period_days: trialPeriodDays,
        metadata: {
          bizosto_plan: config.plan,
          billingCycle: config.billingCycle,
          tenantId,
          source: 'bizosto_app',
        },
      },
    });

    return NextResponse.json({ ok: true, url: session.url, id: session.id });
  } catch (err: any) {
    console.error('[STRIPE_CHECKOUT]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Stripe checkout error' },
      { status: 500 },
    );
  }
}
