import { createHash } from 'crypto';

/**
 * Concurrent refund requests that observed the same recorded refund total must
 * resolve to one Stripe operation. A later intentional partial refund observes a
 * new total and therefore receives a new key.
 */
export function refundOperationIdempotencyKey(
  paymentId: string,
  alreadyRefundedCents: number,
): string {
  const digest = createHash('sha256').update(`${paymentId}|${alreadyRefundedCents}`).digest('hex');
  return `bizosto_refund_${digest}`;
}
