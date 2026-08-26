import { refundOperationIdempotencyKey } from '@/lib/payments/refund-idempotency';

describe('Stripe refund operation idempotency', () => {
  it('converges concurrent requests that observed the same refund state', () => {
    expect(refundOperationIdempotencyKey('pay_1', 0)).toBe(
      refundOperationIdempotencyKey('pay_1', 0),
    );
  });

  it('allows an intentional later partial refund after state advances', () => {
    expect(refundOperationIdempotencyKey('pay_1', 0)).not.toBe(
      refundOperationIdempotencyKey('pay_1', 2_500),
    );
  });

  it('binds the operation to the payment and remains within Stripe key limits', () => {
    const key = refundOperationIdempotencyKey('pay_1', 0);
    expect(key).not.toBe(refundOperationIdempotencyKey('pay_2', 0));
    expect(key.length).toBeLessThanOrEqual(255);
  });
});
