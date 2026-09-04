import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

// Owner-authored CI verification trigger after formatter cleanup.
describe('Tenant Safety PR3 — canonical client payment success', () => {
  const paymentService = read('lib/finance/clientPaymentActivation.ts');
  const manualAdapter = read('lib/finance/manualClientPayment.ts');
  const financePayment = read('app/api/finance/payments/update/route.ts');
  const adminPayment = read('app/api/admin/finance/payments/update/route.ts');
  const financeInvoice = read('app/api/finance/invoices/update/route.ts');
  const adminInvoice = read('app/api/admin/finance/invoices/update/route.ts');
  const dealPayment = read('app/api/deals/mark-paid/route.ts');
  const clientPortalCheckout = read('app/api/payments/create-intent/route.ts');
  const connectWebhook = read('app/api/stripe/connect/webhook/route.ts');
  const stripeHelpers = read('lib/payments/stripe.ts');

  it('uses one canonical service for every successful client-money mutation', () => {
    expect(manualAdapter).toContain('recordSuccessfulClientPayment');
    for (const source of [
      financePayment,
      adminPayment,
      financeInvoice,
      adminInvoice,
      dealPayment,
    ]) {
      expect(source).toContain('recordManualClientPayment');
    }
    expect(connectWebhook).toContain('recordSuccessfulClientPayment');
  });

  it('finalizes pending/failed payment records but treats succeeded records as idempotent replays', () => {
    expect(paymentService).toContain('normalizePaymentStatus');
    expect(paymentService).toContain("previousPaymentStatus === 'refunded'");
    expect(paymentService).toContain("previousPaymentStatus === 'succeeded'");
    expect(paymentService).toContain('tx.set(paymentRef, paymentPayload, { merge: true })');
    expect(paymentService).toContain('previousStatus: previousPaymentStatus');
    expect(paymentService).toContain('Existing payment amount does not match');
  });

  it('keys manual 50/50 payments by installment and records only the current payable amount', () => {
    expect(manualAdapter).toContain(
      'manualInvoicePaymentId(invoiceId, schedule.installmentSequence)',
    );
    expect(manualAdapter).toContain('amount = money(schedule.payableNow)');
    expect(manualAdapter).toContain('manual_invoice_${');
    expect(manualAdapter).toContain('installmentSequence');
  });

  it('retires the legacy deal route as a project/auth/order bypass', () => {
    expect(dealPayment).toContain('deal.invoiceId');
    expect(dealPayment).toContain("code: 'deal_invoice_required'");
    expect(dealPayment).not.toContain('adminAuth');
    expect(dealPayment).not.toContain("collection('projects')");
    expect(dealPayment).not.toContain('createUser(');
    expect(dealPayment).not.toContain('formatOrderId');
    expect(dealPayment).not.toContain('LC-');
    expect(dealPayment).not.toContain(".doc('orders')");
  });

  it('removes direct succeeded/invoice-balance writers from Finance payment confirmation routes', () => {
    for (const source of [financePayment, adminPayment]) {
      expect(source).not.toContain("status: 'succeeded'");
      expect(source).not.toContain('computeInvoiceStatus');
      expect(source).not.toContain('maybeAutoCreateProjectFromInvoice');
      expect(source).not.toContain("collection('finance_ledger')");
    }
  });

  it('removes direct full-balance payment mutation from invoice mark-paid actions', () => {
    for (const source of [financeInvoice, adminInvoice]) {
      const markPaidStart = source.indexOf("if (action === 'mark_paid')");
      const updateStatusStart = source.indexOf("if (action === 'update_status')", markPaidStart);
      expect(markPaidStart).toBeGreaterThan(-1);
      expect(updateStatusStart).toBeGreaterThan(markPaidStart);
      const block = source.slice(markPaidStart, updateStatusStart);
      expect(block).toContain('recordManualClientPayment');
      expect(block).not.toContain('ref.update({');
      expect(block).not.toContain('writeFinanceLedgerEntry');
      expect(block).not.toContain('maybeAutoCreateProjectFromInvoice');
    }
  });

  it('moves client portal Checkout to the tenant Connect account and honors 50/50 payableNow', () => {
    expect(clientPortalCheckout).toContain('resolveInvoicePaymentSchedule(invoice)');
    expect(clientPortalCheckout).toContain('schedule.payableNow');
    expect(clientPortalCheckout).toContain('tenant.stripeConnectAccountId');
    expect(clientPortalCheckout).toContain('tenant.stripeConnectChargesEnabled !== true');
    expect(clientPortalCheckout).toContain('calculatePlatformFee(amountCents)');
    expect(clientPortalCheckout).toContain('stripeAccount: stripeConnectAccountId');
    expect(clientPortalCheckout).toContain('installmentSequence: schedule.installmentSequence');
    expect(clientPortalCheckout).not.toContain("collection('payments')");
    expect(clientPortalCheckout).not.toContain("collection('payment_intents')");
  });

  it('creates direct Connect Checkout with an installment idempotency key and fee', () => {
    expect(stripeHelpers).toContain('paymentIntentData.application_fee_amount');
    expect(stripeHelpers).toContain('stripeAccount');
    expect(stripeHelpers).toContain('client_portal_checkout_${invoiceId}_${installmentSequence}');
    expect(stripeHelpers).toContain('expectedAmountCents');
  });

  it('reconciles both public and client-portal Connect events with tenant/account and amount binding', () => {
    expect(connectWebhook).toContain("new Set(['client_payment_page', 'client_portal'])");
    expect(connectWebhook).toContain('findTenantByAccountId(accountId)');
    expect(connectWebhook).toContain('tenantDoc.id !== tenantId');
    expect(connectWebhook).toContain('expectedAmountCents !== amountReceivedCents');
    expect(connectWebhook).toContain('recordSuccessfulClientPayment');
  });
});
