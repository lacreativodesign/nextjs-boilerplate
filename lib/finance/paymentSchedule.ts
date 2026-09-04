import { roundCurrencyAmount } from '@/lib/finance/minorUnits';

export type PaymentPlan = 'full' | 'fifty_fifty';
export type BalanceTriggerType = 'date' | 'milestone';

export const PROJECT_MILESTONE_STAGES = [
  'Kickoff',
  'Draft',
  'Review',
  'Revisions',
  'Final',
  'Delivered',
] as const;

export type ProjectMilestoneStage = (typeof PROJECT_MILESTONE_STAGES)[number];

export type InvoicePaymentSchedule = {
  paymentPlan: PaymentPlan;
  amountTotal: number;
  totalPaid: number;
  balanceDue: number;
  payableNow: number;
  installmentSequence: number;
  firstInstallmentAmount: number;
  secondInstallmentAmount: number;
};

function invoiceCurrency(invoice: Record<string, unknown>) {
  return String(invoice.currency || 'USD')
    .trim()
    .toUpperCase();
}

export function normalizePaymentPlan(value: unknown): PaymentPlan {
  const token = String(value || '')
    .trim()
    .toLowerCase();
  return token === 'fifty_fifty' || token === '50_50' || token === '50/50'
    ? 'fifty_fifty'
    : 'full';
}

export function resolveAmountTotal(invoice: Record<string, unknown>): number {
  const value = Number(
    invoice.amountTotal ??
      invoice.totalAmount ??
      invoice.amount ??
      invoice.amountSubtotal ??
      invoice.amountTotalUsd ??
      invoice.amountSubtotalUsd ??
      0,
  );
  return roundCurrencyAmount(
    Math.max(0, Number.isFinite(value) ? value : 0),
    invoiceCurrency(invoice),
  );
}

export function resolveTotalPaid(invoice: Record<string, unknown>): number {
  const value = Number(invoice.totalPaid ?? invoice.paidAmount ?? 0);
  return roundCurrencyAmount(
    Math.max(0, Number.isFinite(value) ? value : 0),
    invoiceCurrency(invoice),
  );
}

export function resolveInvoicePaymentSchedule(
  invoice: Record<string, unknown>,
): InvoicePaymentSchedule {
  const currency = invoiceCurrency(invoice);
  const paymentPlan = normalizePaymentPlan(invoice.paymentPlan);
  const amountTotal = resolveAmountTotal(invoice);
  const totalPaid = Math.min(amountTotal, resolveTotalPaid(invoice));
  const balanceDue = roundCurrencyAmount(Math.max(0, amountTotal - totalPaid), currency);

  const configuredFirst = Number(
    invoice.firstInstallmentAmount ?? invoice.firstInstallmentAmountUsd ?? 0,
  );
  const firstInstallmentAmount =
    paymentPlan === 'fifty_fifty'
      ? roundCurrencyAmount(
          configuredFirst > 0
            ? Math.min(configuredFirst, amountTotal)
            : Math.ceil(amountTotal / 2),
          currency,
        )
      : amountTotal;
  const secondInstallmentAmount = roundCurrencyAmount(
    Math.max(0, amountTotal - firstInstallmentAmount),
    currency,
  );

  let payableNow = balanceDue;
  let installmentSequence = totalPaid > 0 ? 2 : 1;

  if (paymentPlan === 'fifty_fifty' && totalPaid <= 0) {
    payableNow = Math.min(balanceDue, firstInstallmentAmount);
    installmentSequence = 1;
  }

  return {
    paymentPlan,
    amountTotal,
    totalPaid,
    balanceDue,
    payableNow: roundCurrencyAmount(payableNow, currency),
    installmentSequence,
    firstInstallmentAmount,
    secondInstallmentAmount,
  };
}

export function normalizeMilestoneStage(value: unknown): ProjectMilestoneStage | null {
  const token = String(value || '').trim();
  return (PROJECT_MILESTONE_STAGES as readonly string[]).includes(token)
    ? (token as ProjectMilestoneStage)
    : null;
}

export function milestoneReached(currentStage: unknown, targetStage: unknown): boolean {
  const current = normalizeMilestoneStage(currentStage);
  const target = normalizeMilestoneStage(targetStage);
  if (!current || !target) return false;
  return PROJECT_MILESTONE_STAGES.indexOf(current) >= PROJECT_MILESTONE_STAGES.indexOf(target);
}
