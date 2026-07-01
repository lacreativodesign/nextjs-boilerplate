import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { getStripePriceId } from '@/lib/billing/stripe-prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    // Prevent creating a SECOND Stripe subscription for a tenant that already has a
    // live one (active or past_due). Re-subscribing is only allowed after cancellation
    // (billingStatus 'canceled'); trial conversion has no subscription yet so it passes.
    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};
    const existingSubscriptionId = String(tenantData.stripeSubscriptionId || '').trim();
    const billingStatus = String(tenantData.billingStatus || '').toLowerCase();
    if (existingSubscriptionId && billingStatus !== 'canceled') {
      return NextResponse.json(
        {
          ok: false,
          error: 'This account already has an active subscription. Change your plan instead of starting a new checkout.',
          code: 'subscription_exists',
        },
        { status: 409 },
      );
    }

    const customerEmail =
      typeof body?.customerEmail === 'string' ? body.customerEmail.trim().toLowerCase() : '';
    const trialPeriodDays = body?.trialPeriodDays === 14 ? 14 : undefined;
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      new URL(req.url).origin ||
      'https://app.bizosto.com'
    ).replace(/\/$/, '');
    const successUrl = resolveCheckoutUrl(body?.successUrl, `${appUrl}/billing?upgraded=1`, appUrl);
    const cancelUrl = resolveCheckoutUrl(body?.cancelUrl, `${appUrl}/billing`, appUrl);
    const config = PLAN_CONFIGS[planKey];
    const stripe = getStripeClient();
    const priceId = getStripePriceId(planKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail || undefined,
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
