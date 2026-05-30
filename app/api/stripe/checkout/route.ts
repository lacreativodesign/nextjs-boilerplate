import { NextResponse } from 'next/server';
import Stripe from 'stripe';

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

async function ensureProduct(
  stripe: Stripe,
  productName: string,
  plan: string,
): Promise<Stripe.Product> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find(
    (p) => p.name === productName || p.metadata?.bizosto_plan === plan,
  );
  if (existing) return existing;
  return stripe.products.create({
    name: productName,
    metadata: { bizosto_plan: plan, source: 'bizosto_platform' },
  });
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  config: (typeof PLAN_CONFIGS)[PlanKey],
): Promise<Stripe.Price> {
  const prices = await stripe.prices.list({
    lookup_keys: [config.lookupKey],
    active: true,
    limit: 1,
  });
  if (prices.data[0]) return prices.data[0];

  return stripe.prices.create({
    currency: 'usd',
    unit_amount: config.amount,
    recurring: { interval: config.interval },
    product: productId,
    lookup_key: config.lookupKey,
    metadata: {
      bizosto_plan: config.plan,
      billingCycle: config.billingCycle,
      source: 'bizosto_platform',
    },
  });
}

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

    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
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
    const product = await ensureProduct(stripe, config.productName, config.plan);
    const price = await ensurePrice(stripe, product.id, config);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
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
  } catch (err) {
    console.error('[STRIPE_CHECKOUT]', err);
    return NextResponse.json(
      { ok: false, error: (err instanceof Error ? err.message : undefined) || 'Stripe checkout error' },
      { status: 500 },
    );
  }
}
