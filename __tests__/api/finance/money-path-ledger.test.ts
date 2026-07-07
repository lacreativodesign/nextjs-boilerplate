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
  const refundRoute = read('app/api/payments/refund/route.ts');
  const adminUpdateRoute = read('app/api/admin/finance/payments/update/route.ts');
  const adminPaymentsPage = read('app/admin/finance/payments/page.tsx');

  describe('public invoice payment routes write ledger entries', () => {
    it.each([
      ['pay', payRoute],
      ['confirm', confirmRoute],
    ])('%s route imports the ledger builder', (_name, source) => {
      expect(source).toContain("import { buildFinanceLedgerEntry } from '@/lib/finance/ledger'");
    });

    it.each([
      ['pay', payRoute],
      ['confirm', confirmRoute],
    ])('%s route writes payment.succeeded and invoice.mark_paid entries', (_name, source) => {
      expect(source).toContain("type: 'payment.succeeded'");
      expect(source).toContain("type: 'invoice.mark_paid'");
      expect(source).toContain("collection('finance_ledger')");
    });

    it.each([
      ['pay', payRoute],
      ['confirm', confirmRoute],
    ])('%s route uses deterministic ledger ids keyed to the PaymentIntent', (_name, source) => {
      expect(source).toContain('payment_succeeded_${paymentIntent.id}');
      expect(source).toContain('invoice_paid_${paymentIntent.id}');
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
