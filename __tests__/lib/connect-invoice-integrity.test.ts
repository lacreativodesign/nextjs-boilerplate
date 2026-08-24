import {
  assertConnectInvoicePaymentIntent,
  connectInvoiceConfirmationKey,
  connectInvoiceIntentKey,
} from '@/lib/payments/connect-invoice-integrity';

const binding = {
  invoiceId: 'invoice-1',
  tenantId: 'tenant-a',
  clientId: 'client-a',
  orderId: 'INV-001',
  amountCents: 10_000,
  currency: 'USD',
};

const metadata = {
  source: 'client_payment_page',
  invoiceId: 'invoice-1',
  tenantId: 'tenant-a',
  clientId: 'client-a',
  orderId: 'INV-001',
};

function intent(overrides: Record<string, unknown> = {}) {
  return {
    amount: 10_000,
    amount_received: 10_000,
    application_fee_amount: 50,
    currency: 'usd',
    metadata,
    ...overrides,
  } as never;
}

describe('Connect invoice PaymentIntent integrity', () => {
  it('accepts an intent fully bound to the server-owned invoice', () => {
    expect(() => assertConnectInvoicePaymentIntent(intent(), binding)).not.toThrow();
  });

  it.each([
    ['tenant metadata', { metadata: { ...metadata, tenantId: 'tenant-b' } }],
    ['amount', { amount_received: 9_999 }],
    ['currency', { currency: 'eur' }],
    ['fee', { application_fee_amount: 0 }],
  ])('rejects a mismatched %s', (_label, override) => {
    expect(() => assertConnectInvoicePaymentIntent(intent(override), binding)).toThrow();
  });

  it('uses one intent key for concurrent cards on the same invoice balance', () => {
    const first = connectInvoiceIntentKey(binding, 2_500);
    const second = connectInvoiceIntentKey({ ...binding }, 2_500);

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(255);
  });

  it('changes the intent key when the authoritative balance version changes', () => {
    expect(connectInvoiceIntentKey(binding, 2_500)).not.toBe(
      connectInvoiceIntentKey({ ...binding, amountCents: 9_000 }, 3_500),
    );
  });

  it('allows a new confirmation attempt for a replacement card without a new intent', () => {
    expect(connectInvoiceConfirmationKey('pi_1', 'pm_1')).not.toBe(
      connectInvoiceConfirmationKey('pi_1', 'pm_2'),
    );
  });
});
