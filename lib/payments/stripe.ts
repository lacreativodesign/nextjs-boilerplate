import Stripe from 'stripe';
import { amountToMinorUnits } from '@/lib/finance/minorUnits';

export const runtime = 'nodejs';

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  return new Stripe(secretKey, { apiVersion: '2024-04-10' });
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_INVOICE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_INVOICE_WEBHOOK_SECRET is not configured.');
  }
  return secret;
}

export function resolveAppOrigin(req: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  return new URL(req.url).origin;
}

export async function createInvoiceCheckoutSession({
  stripe,
  amountUsd,
  currency,
  orderId,
  tenantId,
  invoiceId,
  clientId,
  customerEmail,
  successUrl,
  cancelUrl,
  stripeAccount,
  platformFeeCents,
  installmentSequence,
}: {
  stripe: Stripe;
  amountUsd: number;
  currency: string;
  orderId: string;
  tenantId: string;
  invoiceId: string;
  clientId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  stripeAccount: string;
  platformFeeCents?: number;
  installmentSequence: number;
}) {
  const normalizedCurrency = String(currency || 'USD')
    .trim()
    .toLowerCase();
  const amountCents = amountToMinorUnits(amountUsd, normalizedCurrency);
  const metadata = {
    tenantId,
    invoiceId,
    clientId,
    orderId,
    source: 'client_portal',
    installmentSequence: String(installmentSequence),
    expectedAmountCents: String(amountCents),
    expectedCurrency: normalizedCurrency,
  };

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata,
  };
  if (typeof platformFeeCents === 'number' && platformFeeCents > 0) {
    paymentIntentData.application_fee_amount = Math.round(platformFeeCents);
  }

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      customer_email: customerEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: normalizedCurrency,
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${orderId}`,
              description: `Client portal payment for invoice ${orderId}`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: paymentIntentData,
    },
    {
      stripeAccount,
      idempotencyKey: `client_portal_checkout_${invoiceId}_${installmentSequence}`,
    },
  );
}

export async function createStripeRefund({
  stripe,
  paymentIntentId,
  amountUsd,
  currency = 'USD',
  reason,
  stripeAccount,
  refundApplicationFee,
}: {
  stripe: Stripe;
  paymentIntentId: string;
  amountUsd?: number;
  currency?: string;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  stripeAccount?: string;
  refundApplicationFee?: boolean;
}) {
  const payload: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  };

  if (typeof amountUsd === 'number' && amountUsd > 0) {
    payload.amount = amountToMinorUnits(amountUsd, currency);
  }
  if (reason) {
    payload.reason = reason;
  }
  if (refundApplicationFee) {
    payload.refund_application_fee = true;
  }

  const options: Stripe.RequestOptions | undefined = stripeAccount ? { stripeAccount } : undefined;
  return stripe.refunds.create(payload, options);
}
