import {
  MIN_DAYS_BETWEEN_REMINDERS,
  REMINDABLE_STATUSES,
  computeLateFee,
  daysUntilDue,
  hasOutstandingBalance,
  isOverdue,
  isRemindableStatus,
  resolveLateFeeSettings,
  selectReminderType,
  toDate,
  type ScheduleInvoice,
} from '@/lib/finance/invoice-schedule';

/**
 * P0-4a — invoice reminder / overdue / late-fee schedule.
 *
 * The reminder cron never fired a single email: it read `tenants/{id}/invoices`, a
 * subcollection nothing writes to. Fixing the path was not enough — the record shape was
 * wrong on nearly every field, so these cases pin the corrected semantics against the
 * canonical schema (orderId, amountTotal, balanceDue, Timestamp dueDate, canonical statuses).
 */

const TODAY = new Date('2026-07-23T11:00:00Z');

const invoice = (overrides: Partial<ScheduleInvoice> = {}): ScheduleInvoice => ({
  id: 'inv_1',
  tenantId: 'bizosto',
  clientId: 'client_1',
  orderId: 'BIZ-0001',
  status: 'issued',
  amountTotal: 1000,
  balanceDue: 1000,
  dueDate: '2026-07-26T00:00:00Z',
  ...overrides,
});

describe('P0-4a: toDate accepts every shape the invoice schema can hold', () => {
  it('parses an ISO string', () => {
    expect(toDate('2026-07-26T00:00:00Z')).toBeInstanceOf(Date);
  });

  it('passes a Date through', () => {
    expect(toDate(new Date('2026-07-26'))).toBeInstanceOf(Date);
  });

  it('parses a Firestore Timestamp via toDate()', () => {
    expect(toDate({ toDate: () => new Date('2026-07-26') })).toBeInstanceOf(Date);
  });

  it('parses a serialised Timestamp via seconds / _seconds', () => {
    const seconds = Math.floor(Date.parse('2026-07-26T00:00:00Z') / 1000);
    expect(toDate({ seconds })).toBeInstanceOf(Date);
    expect(toDate({ _seconds: seconds })).toBeInstanceOf(Date);
  });

  it('returns null rather than guessing', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('not-a-date')).toBeNull();
    expect(toDate('   ')).toBeNull();
    expect(toDate(new Date('nonsense'))).toBeNull();
  });
});

describe('P0-4a: daysUntilDue', () => {
  it('counts whole UTC days, negative when overdue', () => {
    expect(daysUntilDue('2026-07-26T00:00:00Z', TODAY)).toBe(3);
    expect(daysUntilDue('2026-07-23T23:00:00Z', TODAY)).toBe(0);
    expect(daysUntilDue('2026-07-16T00:00:00Z', TODAY)).toBe(-7);
    expect(daysUntilDue('2026-06-23T00:00:00Z', TODAY)).toBe(-30);
  });

  it('returns null for an undated invoice', () => {
    expect(daysUntilDue(null, TODAY)).toBeNull();
  });
});

describe('P0-4a: only canonical, unpaid statuses are chased', () => {
  it('the remindable set is exactly issued and partially_paid', () => {
    expect([...REMINDABLE_STATUSES]).toEqual(['issued', 'partially_paid']);
  });

  it('rejects the non-canonical legacy statuses the old cron used', () => {
    expect(isRemindableStatus('sent')).toBe(false);
    expect(isRemindableStatus('overdue')).toBe(false);
  });

  it('rejects terminal and pre-issue statuses', () => {
    expect(isRemindableStatus('draft')).toBe(false);
    expect(isRemindableStatus('paid')).toBe(false);
    expect(isRemindableStatus('void')).toBe(false);
  });

  it('an invoice with nothing outstanding is never chased', () => {
    expect(hasOutstandingBalance(invoice({ balanceDue: 0 }))).toBe(false);
    expect(hasOutstandingBalance(invoice({ balanceDue: Number.NaN }))).toBe(false);
    expect(selectReminderType(invoice({ balanceDue: 0 }), TODAY)).toBeNull();
  });
});

describe('P0-4a: reminder selection', () => {
  it('fires on each scheduled offset', () => {
    expect(selectReminderType(invoice(), TODAY)).toBe('upcoming');
    expect(selectReminderType(invoice({ dueDate: '2026-07-23T00:00:00Z' }), TODAY)).toBe(
      'due_today',
    );
    expect(selectReminderType(invoice({ dueDate: '2026-07-16T00:00:00Z' }), TODAY)).toBe(
      'overdue_1week',
    );
    expect(selectReminderType(invoice({ dueDate: '2026-06-23T00:00:00Z' }), TODAY)).toBe(
      'overdue_1month',
    );
  });

  it('stays silent between offsets', () => {
    expect(selectReminderType(invoice({ dueDate: '2026-07-25T00:00:00Z' }), TODAY)).toBeNull();
    expect(selectReminderType(invoice({ dueDate: '2026-07-20T00:00:00Z' }), TODAY)).toBeNull();
  });

  it('chases a partially paid invoice for the remaining balance', () => {
    expect(selectReminderType(invoice({ status: 'partially_paid', balanceDue: 400 }), TODAY)).toBe(
      'upcoming',
    );
  });

  it('never chases paid, void or draft invoices', () => {
    expect(selectReminderType(invoice({ status: 'paid', balanceDue: 0 }), TODAY)).toBeNull();
    expect(selectReminderType(invoice({ status: 'void' }), TODAY)).toBeNull();
    expect(selectReminderType(invoice({ status: 'draft' }), TODAY)).toBeNull();
  });

  it('skips an invoice with no client to send to', () => {
    expect(selectReminderType(invoice({ clientId: '' }), TODAY)).toBeNull();
  });

  it('skips an undated invoice', () => {
    expect(selectReminderType(invoice({ dueDate: null }), TODAY)).toBeNull();
  });

  it('honours the cooldown so a retry cannot double-send', () => {
    expect(
      selectReminderType(invoice({ lastReminderSent: '2026-07-23T02:00:00Z' }), TODAY),
    ).toBeNull();
    expect(selectReminderType(invoice({ lastReminderSent: '2026-07-22T02:00:00Z' }), TODAY)).toBe(
      'upcoming',
    );
    expect(MIN_DAYS_BETWEEN_REMINDERS).toBe(1);
  });
});

describe('P0-4a: overdue is derived, not stored as a status', () => {
  it('is true only for an unpaid, chaseable invoice past its due date', () => {
    expect(isOverdue(invoice({ dueDate: '2026-07-20T00:00:00Z' }), TODAY)).toBe(true);
    expect(isOverdue(invoice(), TODAY)).toBe(false);
    expect(
      isOverdue(invoice({ status: 'paid', balanceDue: 0, dueDate: '2026-07-01' }), TODAY),
    ).toBe(false);
    expect(isOverdue(invoice({ balanceDue: 0, dueDate: '2026-07-01' }), TODAY)).toBe(false);
  });
});

describe('P0-4a: late fee', () => {
  const settings = resolveLateFeeSettings(undefined);

  it('defaults to 5% after a 3-day grace period', () => {
    expect(settings).toEqual({
      enabled: true,
      type: 'percentage',
      value: 5,
      gracePeriodDays: 3,
    });
  });

  it('charges nothing inside the grace period', () => {
    expect(computeLateFee(invoice({ dueDate: '2026-07-21T00:00:00Z' }), settings, TODAY)).toBe(0);
  });

  it('charges a percentage of amountTotal once the grace period has elapsed', () => {
    expect(computeLateFee(invoice({ dueDate: '2026-07-16T00:00:00Z' }), settings, TODAY)).toBe(50);
  });

  it('supports a fixed fee', () => {
    expect(
      computeLateFee(
        invoice({ dueDate: '2026-07-16T00:00:00Z' }),
        resolveLateFeeSettings({ type: 'fixed', value: 25 }),
        TODAY,
      ),
    ).toBe(25);
  });

  it('never charges twice', () => {
    expect(
      computeLateFee(
        invoice({ dueDate: '2026-07-16T00:00:00Z', lateFeeApplied: true }),
        settings,
        TODAY,
      ),
    ).toBe(0);
  });

  it('charges nothing when disabled, not overdue, or already settled', () => {
    expect(
      computeLateFee(
        invoice({ dueDate: '2026-07-16T00:00:00Z' }),
        resolveLateFeeSettings({ enabled: false }),
        TODAY,
      ),
    ).toBe(0);
    expect(computeLateFee(invoice(), settings, TODAY)).toBe(0);
    expect(
      computeLateFee(
        invoice({ status: 'paid', balanceDue: 0, dueDate: '2026-07-01' }),
        settings,
        TODAY,
      ),
    ).toBe(0);
  });

  it('rounds to whole cents', () => {
    expect(
      computeLateFee(
        invoice({ amountTotal: 333.33, dueDate: '2026-07-16T00:00:00Z' }),
        settings,
        TODAY,
      ),
    ).toBe(16.67);
  });
});
