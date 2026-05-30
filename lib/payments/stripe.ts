import Stripe from "stripe";

export const runtime = "nodejs";

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(secretKey, { apiVersion: "2024-04-10" });
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_INVOICE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_INVOICE_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

export function resolveAppOrigin(req: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return new URL(req.url).origin;
}

export async function createInvoiceCheckoutSession({
  stripe,
  amountUsd,
  orderId,
  tenantId,
  invoiceId,
  clientId,
  customerEmail,
  successUrl,
  cancelUrl,
}: {
  stripe: Stripe;
  amountUsd: number;
  orderId: string;
  tenantId: string;
  invoiceId: string;
  clientId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: customerEmail || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amountUsd * 100),
          product_data: {
            name: `Invoice ${orderId}`,
            description: `Client portal payment for invoice ${orderId}`,
          },
        },
      },
    ],
    metadata: {
      tenantId,
      invoiceId,
      clientId,
      orderId,
      source: "client_portal",
    },
    payment_intent_data: {
      metadata: {
        tenantId,
        invoiceId,
        clientId,
        orderId,
        source: "client_portal",
      },
    },
  });
}

export async function createStripeRefund({
  stripe,
  paymentIntentId,
  amountUsd,
  reason,
}: {
  stripe: Stripe;
  paymentIntentId: string;
  amountUsd?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
}) {
  const payload: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  };

  if (typeof amountUsd === "number" && amountUsd > 0) {
    payload.amount = Math.round(amountUsd * 100);
  }
  if (reason) {
    payload.reason = reason;
  }

  return stripe.refunds.create(payload);
}
