import { createHash } from 'crypto';
import type Stripe from 'stripe';
import { calculatePlatformFee } from '@/lib/stripe/connect';

export type ConnectInvoiceBinding = {
  invoiceId: string;
  tenantId: string;
  clientId?: string;
  orderId?: string;
  amountCents: number;
  currency: string;
};

function boundedIdempotencyKey(prefix: string, material: string): string {
  return `${prefix}_${createHash('sha256').update(material).digest('hex')}`;
}

/**
 * One Stripe PaymentIntent is reused for one immutable invoice-balance version.
 * Deliberately exclude the PaymentMethod: including it permits two cards to create
 * two chargeable intents for the same invoice during a concurrent retry.
 */
export function connectInvoiceIntentKey(
  binding: ConnectInvoiceBinding,
  paidSoFarCents: number,
): string {
  return boundedIdempotencyKey(
    'bizosto_invoice_intent',
    [
      binding.tenantId,
      binding.invoiceId,
      binding.clientId || '',
      binding.orderId || '',
      binding.amountCents,
      binding.currency.toLowerCase(),
      paidSoFarCents,
    ].join('|'),
  );
}

/** A declined card may be replaced while the invoice continues to reuse one intent. */
export function connectInvoiceConfirmationKey(
  paymentIntentId: string,
  paymentMethodId: string,
): string {
  return boundedIdempotencyKey('bizosto_invoice_confirm', `${paymentIntentId}|${paymentMethodId}`);
}

/**
 * A PaymentIntent id is public, and Stripe metadata is context rather than an
 * authorization boundary. Every synchronous confirmation and webhook must bind
 * all immutable payment facts back to the server-owned invoice.
 */
export function assertConnectInvoicePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  binding: ConnectInvoiceBinding,
): void {
  const metadata = paymentIntent.metadata || {};
  const receivedAmount = Number(paymentIntent.amount_received || paymentIntent.amount || 0);
  const expectedFee = calculatePlatformFee(binding.amountCents);

  if (metadata.source !== 'client_payment_page') {
    throw new Error('PaymentIntent source is not an invoice payment.');
  }
  if (String(metadata.invoiceId || '') !== binding.invoiceId) {
    throw new Error('PaymentIntent invoice binding does not match.');
  }
  if (String(metadata.tenantId || '') !== binding.tenantId) {
    throw new Error('PaymentIntent tenant binding does not match.');
  }
  if (binding.clientId && String(metadata.clientId || '') !== binding.clientId) {
    throw new Error('PaymentIntent client binding does not match.');
  }
  if (binding.orderId && String(metadata.orderId || '') !== binding.orderId) {
    throw new Error('PaymentIntent order binding does not match.');
  }
  if (receivedAmount !== binding.amountCents) {
    throw new Error('PaymentIntent amount does not match the invoice balance.');
  }
  if (String(paymentIntent.currency || '').toLowerCase() !== binding.currency.toLowerCase()) {
    throw new Error('PaymentIntent currency does not match the invoice currency.');
  }
  if (Number(paymentIntent.application_fee_amount || 0) !== expectedFee) {
    throw new Error('PaymentIntent fee does not match the approved 0.5% fee.');
  }
}
