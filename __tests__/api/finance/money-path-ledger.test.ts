/**
 * Money-path finance ledger gate.
 *
 * Locked finance rules: every money movement writes append-only finance_ledger
 * entries atomically with the mutation, and refund state can only change through
 * the canonical Stripe refund route. These static source assertions keep those
 * guarantees from silently regressing.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('money-path finance ledger gate', () => {
  const payRoute = read('app/api/public/invoice/[invoiceId]/pay/route.ts');
  const confirmRoute = read('app/api/public/invoice/[invoiceId]/confirm/route.ts');
  const connectWebhook = read('app/api/stripe/connect/webhook/route.ts');
  const paymentService = read('lib/finance/clientPaymentActivation.ts');
  const refundRoute = read('app/api/payments/refund/route.ts');
  const adminUpdateRoute = read('app/api/admin/finance/payments/update/route.ts');
  const adminPaymentsPage = read('app/admin/finance/payments/page.tsx');

  describe('public invoice payment paths use one canonical ledgered service', () => {
    it.each([
      ['pay', payRoute],
      ['confirm', confirmRoute],
      ['connect webhook', connectWebhook],
    ])('%s delegates successful payment reconciliation', (_name, source) => {
      expect(source).toContain('recordSuccessfulClientPayment');
    });

    it('the canonical service writes payment and invoice-application ledger entries', () => {
      expect(paymentService).toContain("import { buildFinanceLedgerEntry } from '@/lib/finance/ledger'");
      expect(paymentService).toContain("type: 'payment.succeeded'");
      expect(paymentService).toContain("type: 'invoice.payment_applied'");
      expect(paymentService).toContain("collection('finance_ledger')");
    });

    it('uses deterministic ledger ids keyed to the provider payment id', () => {
      expect(paymentService).toContain('payment_succeeded_${paymentId}');
      expect(paymentService).toContain('invoice_payment_${paymentId}');
    });

    it('updates payment, invoice balance and ledger inside one transaction', () => {
      const txStart = paymentService.indexOf('runTransaction');
      expect(txStart).toBeGreaterThan(-1);
      expect(paymentService.indexOf("collection('payments')", txStart)).toBeGreaterThan(txStart);
      expect(paymentService.indexOf("collection('finance_ledger')", txStart)).toBeGreaterThan(txStart);
      expect(paymentService.indexOf('tx.update(invoiceRef', txStart)).toBeGreaterThan(txStart);
    });
  });

  describe('canonical refund route is Stripe-executed and ledgered', () => {
    it('executes the refund through Stripe', () => {
      expect(refundRoute).toContain('createStripeRefund');
    });

    it('writes refund.created and payment.refunded ledger entries', () => {
      expect(refundRoute).toContain("type: 'refund.created'");
      expect(refundRoute).toContain("type: 'payment.refunded'");
      expect(refundRoute).toContain("collection('finance_ledger')");
    });

    it('records refund reversals as negative amounts', () => {
      expect(refundRoute).toContain('amountUsd: -refundAmountUsd');
    });

    it('writes ledger entries inside the payment transaction', () => {
      const txStart = refundRoute.indexOf('runTransaction');
      expect(txStart).toBeGreaterThan(-1);
      expect(refundRoute.indexOf("type: 'refund.created'")).toBeGreaterThan(txStart);
      expect(refundRoute.indexOf("type: 'payment.refunded'")).toBeGreaterThan(txStart);
    });
  });

  describe('fake refund path is closed', () => {
    it('admin payment update route no longer marks payments refunded directly', () => {
      expect(adminUpdateRoute).not.toContain("status: 'refunded'");
    });

    it('admin payment update route rejects the refund action with guidance', () => {
      expect(adminUpdateRoute).toContain("if (action === 'refund')");
      expect(adminUpdateRoute).toContain('status: 400');
    });

    it('admin payments UI routes refunds to the canonical Stripe refund endpoint', () => {
      expect(adminPaymentsPage).toContain("'/api/payments/refund'");
    });
  });
});
