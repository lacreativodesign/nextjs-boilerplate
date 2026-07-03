import { NextResponse } from 'next/server';
import { requireFinance } from '@/app/api/finance/_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { adminDb } from '@/lib/firebaseAdmin';
import { calculateVariance } from '@/lib/finance/budget';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

type BudgetCategoryRecord = {
  id: string;
  name: string;
  allocatedAmount: number;
  spentAmount?: number;
  remainingAmount?: number;
};

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const { searchParams } = new URL(req.url);
    const budgetId = searchParams.get('budgetId');

    if (!budgetId) {
      throw new AppError({
        message: 'Budget ID is required',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const budgetSnap = await adminDb.collection('budgets').doc(budgetId).get();
    if (!budgetSnap.exists) {
      throw new AppError({
        message: 'Budget not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    const budget = budgetSnap.data();
    if (!budget || budget.tenantId !== auth.user.tenantId) {
      throw new AppError({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const categories: BudgetCategoryRecord[] =
      (budget.categories as BudgetCategoryRecord[] | undefined) || [];
    const categoryVariances = categories.map((category) => {
      const spentAmount = category.spentAmount || 0;
      const remainingAmount =
        category.remainingAmount !== undefined
          ? category.remainingAmount
          : category.allocatedAmount - spentAmount;
      return {
        categoryId: category.id,
        categoryName: category.name,
        allocatedAmount: category.allocatedAmount,
        spentAmount,
        remainingAmount,
        ...calculateVariance(category.allocatedAmount, spentAmount),
      };
    });

    const totalAllocated = Number(budget.totalAmount || 0);
    const totalSpent = categories.reduce((sum, category) => sum + (category.spentAmount || 0), 0);
    const overallVariance = calculateVariance(totalAllocated, totalSpent);

    return NextResponse.json({
      ok: true,
      variance: {
        budgetId,
        budgetName: budget.name,
        period: budget.period,
        startDate: budget.startDate,
        endDate: budget.endDate,
        currency: budget.currency,
        totalAllocated,
        totalSpent,
        totalRemaining: totalAllocated - totalSpent,
        ...overallVariance,
        categories: categoryVariances,
      },
    });
  } catch (err) {
    logError(err, { route: 'GET /api/finance/budgets/variance' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to generate variance report',
    });
    return NextResponse.json(body, { status });
  }
}
