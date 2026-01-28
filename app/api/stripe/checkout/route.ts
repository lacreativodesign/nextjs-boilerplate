import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_NAME = "Bizosto Pro";
const PRODUCT_METADATA = {
  bizosto_plan: "pro",
  source: "bizosto_platform",
};

const PRICE_LOOKUP_KEYS = {
  monthly: "bizosto_pro_monthly",
  annual: "bizosto_pro_annual",
} as const;

const PLAN_CONFIGS = {
  pro_monthly: {
    billingCycle: "monthly",
    amount: 9900,
    interval: "month",
    lookupKey: PRICE_LOOKUP_KEYS.monthly,
  },
  pro_annual: {
    billingCycle: "annual",
    amount: 99000,
    interval: "year",
    lookupKey: PRICE_LOOKUP_KEYS.annual,
  },
} as const;

type PlanKey = keyof typeof PLAN_CONFIGS;

type PlanConfig = (typeof PLAN_CONFIGS)[PlanKey];

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(secretKey, { apiVersion: "2024-06-20" });
}

async function ensureProduct(stripe: Stripe): Promise<Stripe.Product> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find(
    (product) => product.name === PRODUCT_NAME || product.metadata?.bizosto_plan === PRODUCT_METADATA.bizosto_plan
  );

  if (existing) {
    return existing;
  }

  return stripe.products.create({
    name: PRODUCT_NAME,
    metadata: PRODUCT_METADATA,
  });
}

async function ensurePrice({
  stripe,
  productId,
  config,
}: {
  stripe: Stripe;
  productId: string;
  config: PlanConfig;
}): Promise<Stripe.Price> {
  const prices = await stripe.prices.list({
    lookup_keys: [config.lookupKey],
    active: true,
    limit: 1,
  });

  const existing = prices.data[0];
  if (existing) {
    return existing;
  }

  return stripe.prices.create({
    currency: "usd",
    unit_amount: config.amount,
    recurring: {
      interval: config.interval,
    },
    product: productId,
    lookup_key: config.lookupKey,
    metadata: {
      plan: "pro",
      billingCycle: config.billingCycle,
      source: "bizosto_platform",
    },
  });
}

function parsePlan(value: unknown): PlanKey | null {
  if (typeof value !== "string") return null;
  return value in PLAN_CONFIGS ? (value as PlanKey) : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const planKey = parsePlan(body?.plan);

    if (!planKey) {
      return NextResponse.json({ ok: false, error: "Invalid plan." }, { status: 400 });
    }

    const stripe = getStripeClient();
    const config = PLAN_CONFIGS[planKey];
    const product = await ensureProduct(stripe);
    const price = await ensurePrice({ stripe, productId: product.id, config });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      success_url: "https://login.bizosto.com/welcome",
      cancel_url: "https://www.bizosto.com/pricing",
      metadata: {
        plan: "pro",
        billingCycle: config.billingCycle,
        source: "bizosto_website",
      },
      subscription_data: {
        metadata: {
          plan: "pro",
          billingCycle: config.billingCycle,
          source: "bizosto_website",
        },
      },
    });

    return NextResponse.json({ ok: true, url: session.url, id: session.id });
  } catch (err: any) {
    const message = err?.message || "Stripe checkout error";
    console.error("stripe checkout error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
