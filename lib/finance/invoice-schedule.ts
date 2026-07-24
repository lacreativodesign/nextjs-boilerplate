/**
 * Invoice reminder / overdue / late-fee schedule (P0-4a).
 *
 * All date and money decisions for the invoice-reminder cron live here as pure functions so
 * they can be tested without Firestore. The cron itself only does IO.
 *
 * Context: the cron was reading `tenants/{id}/invoices`, a subcollection nothing writes to.
 * The canonical invoice lives at top-level `invoices` with a `tenantId` field. Beyond the
 * path, the cron's record shape disagreed with the canonical schema on almost every field:
 * an invoice-number field vs `orderId`, a flat total vs `amountTotal`/`balanceDue`, an
 * ISO-string dueDate vs a Firestore Timestamp, and statuses `sent`/`overdue` which are not
 * canonical tokens (see lib/finance/status.ts — the real set is
 * draft | issued | partially_paid | paid | void).
 */

/** Canonical statuses that can still receive a reminder or a late fee. */
export const REMINDABLE_STATUSES = ['issued', 'partially_paid'] as const;

export type ReminderType = 'upcoming' | 'due_today' | 'overdue_1week' | 'overdue_1month';

/** Days until due (negative = overdue) that trigger each reminder. */
export const REMINDER_OFFSETS: Record<number, ReminderType> = {
  3: 'upcoming',
  0: 'due_today',
  [-7]: 'overdue_1week',
  [-30]: 'overdue_1month',
};

/** Minimum whole days between two reminders for the same invoice. */
export const MIN_DAYS_BETWEEN_REMINDERS = 1;

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type LateFeeSettings = {
  enabled: boolean;
  type: 'percentage' | 'fixed';
  value: number;
  gracePeriodDays: number;
};

export type ScheduleInvoice = {
  id: string;
  tenantId: string;
  clientId: string;
  orderId: string;
  status: string;
  amountTotal: number;
  balanceDue: number;
  dueDate: unknown;
  lateFeeApplied?: boolean;
  reminderCount?: number;
  lastReminderSent?: unknown;
};

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Accepts a Firestore Timestamp, a Date, an ISO string or a numeric epoch and returns a Date.
 * Anything unparseable returns null so the caller can skip rather than guess.
 */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Firestore Timestamp (admin SDK) — duck-typed so this module stays dependency-free.
  const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof candidate?.toDate === 'function') {
    const converted = candidate.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  const seconds = candidate?.seconds ?? candidate?._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    return new Date(seconds * 1000);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/** Whole days from today to the due date. Negative means overdue. Null if undated. */
export function daysUntilDue(dueDate: unknown, today: Date): number | null {
  const due = toDate(dueDate);
  if (!due) return null;
  return Math.round((startOfUtcDay(due).getTime() - startOfUtcDay(today).getTime()) / MS_PER_DAY);
}

/** An invoice with nothing left to pay is never chased, whatever its status says. */
export function hasOutstandingBalance(invoice: ScheduleInvoice): boolean {
  const balance = Number(invoice.balanceDue);
  if (!Number.isFinite(balance)) return false;
  return balance > 0;
}

export function isRemindableStatus(status: unknown): boolean {
  return (REMINDABLE_STATUSES as readonly string[]).includes(String(status ?? '').trim());
}

export function isOverdue(invoice: ScheduleInvoice, today: Date): boolean {
  if (!isRemindableStatus(invoice.status)) return false;
  if (!hasOutstandingBalance(invoice)) return false;
  const days = daysUntilDue(invoice.dueDate, today);
  return days !== null && days < 0;
}

/**
 * Which reminder, if any, is due today. Returns null when the invoice is not chaseable, is
 * undated, is not on a reminder offset, or was already reminded within the cooldown.
 */
export function selectReminderType(invoice: ScheduleInvoice, today: Date): ReminderType | null {
  if (!isRemindableStatus(invoice.status)) return null;
  if (!hasOutstandingBalance(invoice)) return null;
  if (!invoice.clientId) return null;

  const days = daysUntilDue(invoice.dueDate, today);
  if (days === null) return null;

  const reminder = REMINDER_OFFSETS[days];
  if (!reminder) return null;

  const last = toDate(invoice.lastReminderSent);
  if (last) {
    const sinceLast = Math.round(
      (startOfUtcDay(today).getTime() - startOfUtcDay(last).getTime()) / MS_PER_DAY,
    );
    if (sinceLast < MIN_DAYS_BETWEEN_REMINDERS) return null;
  }

  return reminder;
}

export function resolveLateFeeSettings(raw: Partial<LateFeeSettings> | undefined): LateFeeSettings {
  return {
    enabled: Boolean(raw?.enabled ?? true),
    type: raw?.type === 'fixed' ? 'fixed' : 'percentage',
    value: Number(raw?.value ?? 5),
    gracePeriodDays: Math.max(0, Number(raw?.gracePeriodDays ?? 3)),
  };
}

/**
 * Late fee in the invoice currency, or 0 when none is due.
 * Charged on `amountTotal`, once, and only after the grace period has fully elapsed.
 */
export function computeLateFee(
  invoice: ScheduleInvoice,
  settings: LateFeeSettings,
  today: Date,
): number {
  if (!settings.enabled) return 0;
  if (invoice.lateFeeApplied) return 0;
  if (!isOverdue(invoice, today)) return 0;

  const days = daysUntilDue(invoice.dueDate, today);
  if (days === null) return 0;

  const daysOverdue = Math.abs(days);
  if (daysOverdue <= settings.gracePeriodDays) return 0;

  const amountTotal = Number(invoice.amountTotal);
  if (!Number.isFinite(amountTotal) || amountTotal <= 0) return 0;

  const raw =
    settings.type === 'percentage' ? amountTotal * (settings.value / 100) : settings.value;
  const fee = Number(Math.max(0, Number(raw)).toFixed(2));
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}
