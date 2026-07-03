import { adminDb } from '@/lib/firebaseAdmin';

export interface ProfitLossReport {
  period: { start: string; end: string };
  revenue: {
    total: number;
    breakdown: { category: string; amount: number }[];
  };
  expenses: {
    total: number;
    breakdown: { category: string; amount: number }[];
  };
  netIncome: number;
  netMargin: number;
}

function toAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function parseDateValue(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (
    typeof value === 'object' &&
    value &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  return null;
}

export async function generateProfitLoss(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<ProfitLossReport> {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid reporting period');
  }

  if (startDate > endDate) {
    throw new Error('startDate must be on or before endDate');
  }

  const [invoiceSnapshot, expenseSnapshot] = await Promise.all([
    adminDb
      .collection('invoices')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'paid')
      .get(),
    adminDb
      .collection('expenses')
      .where('tenantId', '==', tenantId)
      .where('isDeleted', '==', false)
      .get(),
  ]);

  let revenue = 0;
  invoiceSnapshot.docs.forEach((doc) => {
    const invoice = doc.data();
    const issueDate = parseDateValue(invoice.issueDate);
    if (!issueDate || issueDate < startDate || issueDate > endDate) {
      return;
    }
    revenue += toAmount(invoice.total ?? invoice.totalUsd ?? invoice.amount);
  });

  const expensesByCategory: Record<string, number> = {};
  expenseSnapshot.docs.forEach((doc) => {
    const expense = doc.data();
    const expenseDate = parseDateValue(expense.date ?? expense.expenseDate ?? expense.createdAt);
    if (!expenseDate || expenseDate < startDate || expenseDate > endDate) {
      return;
    }

    const category = String(expense.category || 'Uncategorized');
    const amount = toAmount(expense.amount ?? expense.amountPkr);
    expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
  });

  const totalExpenses = Object.values(expensesByCategory).reduce((sum, amount) => sum + amount, 0);
  const netIncome = revenue - totalExpenses;

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    revenue: {
      total: revenue,
      breakdown: [{ category: 'Sales', amount: revenue }],
    },
    expenses: {
      total: totalExpenses,
      breakdown: Object.entries(expensesByCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
    netIncome,
    netMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
  };
}
