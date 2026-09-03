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

function roundMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
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
    invoice.amountTotalUsd ??
      invoice.amountTotal ??
      invoice.totalAmount ??
      invoice.amount ??
      invoice.amountSubtotalUsd ??
      0,
  );
  return roundMoney(Math.max(0, Number.isFinite(value) ? value : 0));
}

export function resolveTotalPaid(invoice: Record<string, unknown>): number {
  const value = Number(invoice.totalPaid ?? invoice.paidAmount ?? 0);
  return roundMoney(Math.max(0, Number.isFinite(value) ? value : 0));
}

export function resolveInvoicePaymentSchedule(
  invoice: Record<string, unknown>,
): InvoicePaymentSchedule {
  const paymentPlan = normalizePaymentPlan(invoice.paymentPlan);
  const amountTotal = resolveAmountTotal(invoice);
  const totalPaid = Math.min(amountTotal, resolveTotalPaid(invoice));
  const balanceDue = roundMoney(Math.max(0, amountTotal - totalPaid));

  const configuredFirst = Number(invoice.firstInstallmentAmountUsd ?? 0);
  const firstInstallmentAmount =
    paymentPlan === 'fifty_fifty'
      ? roundMoney(
          configuredFirst > 0
            ? Math.min(configuredFirst, amountTotal)
            : Math.ceil(amountTotal * 50) / 100,
        )
      : amountTotal;
  const secondInstallmentAmount = roundMoney(Math.max(0, amountTotal - firstInstallmentAmount));

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
    payableNow: roundMoney(payableNow),
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
