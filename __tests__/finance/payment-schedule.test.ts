import { milestoneReached, resolveInvoicePaymentSchedule } from '@/lib/finance/paymentSchedule';

describe('client payment schedule', () => {
  it('charges a full invoice in one installment', () => {
    expect(
      resolveInvoicePaymentSchedule({
        amountTotalUsd: 1000,
        paymentPlan: 'full',
        totalPaid: 0,
      }),
    ).toMatchObject({
      paymentPlan: 'full',
      amountTotal: 1000,
      totalPaid: 0,
      balanceDue: 1000,
      payableNow: 1000,
      installmentSequence: 1,
      firstInstallmentAmount: 1000,
      secondInstallmentAmount: 0,
    });
  });

  it('charges only the first 50% deposit before project activation', () => {
    expect(
      resolveInvoicePaymentSchedule({
        amountTotalUsd: 1000,
        paymentPlan: 'fifty_fifty',
        totalPaid: 0,
      }),
    ).toMatchObject({
      paymentPlan: 'fifty_fifty',
      balanceDue: 1000,
      payableNow: 500,
      installmentSequence: 1,
      firstInstallmentAmount: 500,
      secondInstallmentAmount: 500,
    });
  });

  it('charges the remaining balance after the 50% deposit', () => {
    expect(
      resolveInvoicePaymentSchedule({
        amountTotalUsd: 1000,
        paymentPlan: 'fifty_fifty',
        totalPaid: 500,
      }),
    ).toMatchObject({
      totalPaid: 500,
      balanceDue: 500,
      payableNow: 500,
      installmentSequence: 2,
    });
  });

  it('splits odd cents without losing or inventing money', () => {
    const schedule = resolveInvoicePaymentSchedule({
      amountTotalUsd: 999.99,
      paymentPlan: 'fifty_fifty',
      totalPaid: 0,
    });

    expect(schedule.firstInstallmentAmount).toBe(500);
    expect(schedule.secondInstallmentAmount).toBe(499.99);
    expect(schedule.firstInstallmentAmount + schedule.secondInstallmentAmount).toBe(999.99);
  });

  it('treats a reached or later project stage as a due milestone', () => {
    expect(milestoneReached('Review', 'Review')).toBe(true);
    expect(milestoneReached('Final', 'Review')).toBe(true);
    expect(milestoneReached('Draft', 'Review')).toBe(false);
    expect(milestoneReached('nonsense', 'Review')).toBe(false);
  });
});
