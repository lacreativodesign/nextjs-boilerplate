import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '../_utils';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';
import type { Budget, BudgetCategory, MonthlyBudget, YearComparison } from '@/lib/types/budget';

export const dynamic = 'force-dynamic';

type InvoiceDoc = {
  status?: string;
  amountTotal?: number;
  amountTotalUsd?: number;
  totalUSD?: number;
  paidAt?: Date | string | null;
  issuedAt?: Date | string | null;
};

type ExpenseDoc = {
  amountPkr?: number;
  amount?: number;
  expenseDate?: Date | string | null;
  date?: Date | string | null;
};

type RawBudgetDoc = Partial<Budget> & {
  categories?: Partial<BudgetCategory>[];
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asNumber(value: unknown, fallback = 0): number {
  const casted = Number(value);
  return Number.isFinite(casted) ? casted : fallback;
}

function normalizeMonthlyBudgets(monthlyBudgets: Partial<MonthlyBudget>[] = []): MonthlyBudget[] {
  const byMonth = new Map<number, Partial<MonthlyBudget>>();
  monthlyBudgets.forEach((month) => {
    const normalizedMonth = asNumber(month.month, 0);
    if (normalizedMonth >= 1 && normalizedMonth <= 12) {
      byMonth.set(normalizedMonth, month);
    }
  });

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const existing = byMonth.get(month);
    const budgeted = asNumber(existing?.budgeted, 0);
    const actual = asNumber(existing?.actual, 0);
    return {
      month,
      budgeted,
      actual,
      variance: actual - budgeted,
    };
  });
}

function normalizeCategory(category: Partial<BudgetCategory>, index: number): BudgetCategory {
  const monthlyBudgets = normalizeMonthlyBudgets(category.monthlyBudgets ?? []);
  const totalBudget = monthlyBudgets.reduce((sum, month) => sum + month.budgeted, 0);
  const totalActual = monthlyBudgets.reduce((sum, month) => sum + month.actual, 0);
  const variance = totalActual - totalBudget;
  const variancePercentage = totalBudget === 0 ? 0 : (variance / totalBudget) * 100;

  return {
    id: String(category.id || `cat-${index + 1}`),
    name: String(category.name || `Category ${index + 1}`),
    type: category.type === 'revenue' ? 'revenue' : 'expense',
    monthlyBudgets,
    totalBudget,
    totalActual,
    variance,
    variancePercentage,
  };
}

function normalizeBudget(id: string, tenantId: string, raw: RawBudgetDoc): Budget {
  const docScopedTenantId = normalizeTenantId(raw.tenantId || tenantId);
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((c, index) => normalizeCategory(c, index))
    : [];
  return {
    id,
    tenantId: docScopedTenantId,
    name: String(raw.name || 'Untitled budget'),
    description: raw.description ? String(raw.description) : undefined,
    fiscalYear: asNumber(raw.fiscalYear, new Date().getFullYear()),
    currency: String(raw.currency || 'USD'),
    categories,
    status: raw.status === 'active' || raw.status === 'completed' ? raw.status : 'draft',
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    createdBy: String(raw.createdBy || ''),
  };
}

async function calculateActuals(tenantId: string, budget: Budget): Promise<Budget> {
  const year = budget.fiscalYear;
  const invoiceDocs = await queryWithTenant(
    adminDb
      .collection('invoices')
      .where('status', 'in', ['Paid', 'paid'])
      .where('isDeleted', '==', false),
    tenantId,
  );
  const expenseDocs = await queryWithTenant(
    adminDb.collection('expenses').where('isDeleted', '==', false),
    tenantId,
  );

  const revenueByMonth = new Map<number, number>();
  const expenseByMonth = new Map<number, number>();

  invoiceDocs.forEach((doc) => {
    const data = (doc.data() || {}) as InvoiceDoc;
    const dateValue = toDate(data.paidAt) || toDate(data.issuedAt);
    if (!dateValue || dateValue.getFullYear() !== year) return;
    const month = dateValue.getMonth() + 1;
    const amount = asNumber(data.amountTotal ?? data.amountTotalUsd ?? data.totalUSD, 0);
    revenueByMonth.set(month, asNumber(revenueByMonth.get(month), 0) + amount);
  });

  expenseDocs.forEach((doc) => {
    const data = (doc.data() || {}) as ExpenseDoc;
    const dateValue = toDate(data.expenseDate) || toDate(data.date);
    if (!dateValue || dateValue.getFullYear() !== year) return;
    const month = dateValue.getMonth() + 1;
    const amount = asNumber(data.amountPkr ?? data.amount, 0);
    expenseByMonth.set(month, asNumber(expenseByMonth.get(month), 0) + amount);
  });

  const categories = budget.categories.map((category) => {
    const monthlyBudgets = category.monthlyBudgets.map((monthly) => {
      const actualByType = category.type === 'revenue' ? revenueByMonth : expenseByMonth;
      const actual = asNumber(actualByType.get(monthly.month), 0);
      return {
        ...monthly,
        actual,
        variance: actual - monthly.budgeted,
      };
    });

    const totalBudget = monthlyBudgets.reduce((sum, month) => sum + month.budgeted, 0);
    const totalActual = monthlyBudgets.reduce((sum, month) => sum + month.actual, 0);
    const variance = totalActual - totalBudget;
    const variancePercentage = totalBudget === 0 ? 0 : (variance / totalBudget) * 100;

    return {
      ...category,
      monthlyBudgets,
      totalBudget,
      totalActual,
      variance,
      variancePercentage,
    };
  });

  return {
    ...budget,
    categories,
    updatedAt: new Date().toISOString(),
  };
}

function createYearComparisons(budgets: Budget[], year: number): YearComparison[] {
  const currentYearBudgets = budgets.filter((budget) => budget.fiscalYear === year);
  const previousYearBudgets = budgets.filter((budget) => budget.fiscalYear === year - 1);

  return currentYearBudgets.map((budget) => {
    const previousYearBudget = previousYearBudgets.find(
      (candidate) => candidate.name === budget.name,
    );
    const currentTotalBudget = budget.categories.reduce(
      (sum, category) => sum + category.totalBudget,
      0,
    );
    const previousTotalBudget = previousYearBudget
      ? previousYearBudget.categories.reduce((sum, category) => sum + category.totalBudget, 0)
      : 0;
    const changeAmount = currentTotalBudget - previousTotalBudget;
    const changePercentage =
      previousTotalBudget === 0 ? 0 : (changeAmount / previousTotalBudget) * 100;

    return {
      currentYear: year,
      previousYear: year - 1,
      currentTotalBudget,
      previousTotalBudget,
      changeAmount,
      changePercentage,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const budgetId = searchParams.get('budgetId');

    const year = yearParam ? asNumber(yearParam, NaN) : null;
    if (yearParam && Number.isNaN(year as number)) {
      return NextResponse.json({ ok: false, error: 'Invalid year parameter.' }, { status: 400 });
    }

    const docs = budgetId
      ? [await adminDb.collection('budgets').doc(budgetId).get()].filter(
          (doc) => doc.exists && docTenantId(doc.data()) === tenantId,
        )
      : await queryWithTenant(adminDb.collection('budgets'), tenantId);

    const normalized = docs
      .map((doc) => normalizeBudget(doc.id, tenantId, (doc.data() || {}) as RawBudgetDoc))
      .filter((budget) => budget.tenantId === tenantId)
      .filter((budget) => (year ? budget.fiscalYear === year : true));

    const budgets = await Promise.all(
      normalized.map((budget) => calculateActuals(tenantId, budget)),
    );
    const yearComparisons = year ? createYearComparisons(budgets, year) : [];

    return NextResponse.json({ ok: true, budgets, yearComparisons });
  } catch (error: any) {
    console.error('finance/budgets get error:', error);
    const rawMessage = String(error?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Failed to fetch budgets.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const body = await request.json();

    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim();
    const fiscalYear = asNumber(body?.fiscalYear, new Date().getFullYear());
    const currency = String(body?.currency || 'USD')
      .trim()
      .toUpperCase();
    const categoriesInput = Array.isArray(body?.categories) ? body.categories : [];

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Budget name is required.' }, { status: 400 });
    }

    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
      return NextResponse.json({ ok: false, error: 'Fiscal year is invalid.' }, { status: 400 });
    }

    if (categoriesInput.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'At least one category is required.' },
        { status: 400 },
      );
    }

    const categories = categoriesInput.map((category: Partial<BudgetCategory>, index: number) =>
      normalizeCategory(
        {
          ...category,
          id: category.id || crypto.randomUUID(),
          monthlyBudgets: normalizeMonthlyBudgets(category.monthlyBudgets || []),
        },
        index,
      ),
    );

    const now = new Date().toISOString();
    const budgetPayload: Omit<Budget, 'id'> = {
      tenantId,
      name,
      description: description || undefined,
      fiscalYear,
      currency,
      categories,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user.uid,
    };

    const ref = adminDb.collection('budgets').doc();
    await ref.set(budgetPayload);

    return NextResponse.json({
      ok: true,
      id: ref.id,
      budget: {
        id: ref.id,
        ...budgetPayload,
      },
    });
  } catch (error: any) {
    console.error('finance/budgets create error:', error);
    const rawMessage = String(error?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Failed to create budget.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
