import {
  parseInvoiceStatus,
  normalizeInvoiceStatus,
  parsePaymentStatus,
  normalizePaymentStatus,
} from '@/lib/finance/status';

describe('lib/finance/status', () => {
  describe('parseInvoiceStatus', () => {
    it('returns draft for "draft"', () => {
      expect(parseInvoiceStatus('draft')).toBe('draft');
    });

    it('returns issued for "issued"', () => {
      expect(parseInvoiceStatus('issued')).toBe('issued');
    });

    it('returns issued for "sent"', () => {
      expect(parseInvoiceStatus('sent')).toBe('issued');
    });

    it('returns issued for "overdue"', () => {
      expect(parseInvoiceStatus('overdue')).toBe('issued');
    });

    it('returns partially_paid for "partially_paid"', () => {
      expect(parseInvoiceStatus('partially_paid')).toBe('partially_paid');
    });

    it('returns partially_paid for "partial"', () => {
      expect(parseInvoiceStatus('partial')).toBe('partially_paid');
    });

    it('returns paid for "paid"', () => {
      expect(parseInvoiceStatus('paid')).toBe('paid');
    });

    it('returns void for "void"', () => {
      expect(parseInvoiceStatus('void')).toBe('void');
    });

    it('returns void for "voided"', () => {
      expect(parseInvoiceStatus('voided')).toBe('void');
    });

    it('returns null for empty string', () => {
      expect(parseInvoiceStatus('')).toBeNull();
    });

    it('returns null for unknown status', () => {
      expect(parseInvoiceStatus('unknown_xyz')).toBeNull();
    });

    it('handles uppercase input', () => {
      expect(parseInvoiceStatus('PAID')).toBe('paid');
      expect(parseInvoiceStatus('DRAFT')).toBe('draft');
    });
  });

  describe('normalizeInvoiceStatus', () => {
    it('returns draft as default for null', () => {
      expect(normalizeInvoiceStatus(null)).toBe('draft');
    });

    it('returns draft as default for empty string', () => {
      expect(normalizeInvoiceStatus('')).toBe('draft');
    });

    it('returns draft as default for unknown', () => {
      expect(normalizeInvoiceStatus('garbage')).toBe('draft');
    });

    it('returns valid status unchanged', () => {
      expect(normalizeInvoiceStatus('paid')).toBe('paid');
    });
  });

  describe('parsePaymentStatus', () => {
    it('returns pending for "pending"', () => {
      expect(parsePaymentStatus('pending')).toBe('pending');
    });

    it('returns succeeded for "succeeded"', () => {
      expect(parsePaymentStatus('succeeded')).toBe('succeeded');
    });

    it('returns succeeded for "paid"', () => {
      expect(parsePaymentStatus('paid')).toBe('succeeded');
    });

    it('returns failed for "failed"', () => {
      expect(parsePaymentStatus('failed')).toBe('failed');
    });

    it('returns refunded for "refunded"', () => {
      expect(parsePaymentStatus('refunded')).toBe('refunded');
    });

    it('returns null for empty string', () => {
      expect(parsePaymentStatus('')).toBeNull();
    });

    it('handles uppercase', () => {
      expect(parsePaymentStatus('PENDING')).toBe('pending');
    });
  });

  describe('normalizePaymentStatus', () => {
    it('returns pending as default for null', () => {
      expect(normalizePaymentStatus(null)).toBe('pending');
    });

    it('returns pending as default for empty', () => {
      expect(normalizePaymentStatus('')).toBe('pending');
    });

    it('returns valid status unchanged', () => {
      expect(normalizePaymentStatus('succeeded')).toBe('succeeded');
    });
  });
});
