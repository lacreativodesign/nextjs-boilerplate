import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFinance, serverTimestamp } from '@/app/api/finance/_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { adminDb } from '@/lib/firebaseAdmin';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

const recordActualSchema = z.object({
  budgetId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().min(1),
  date: z.string().min(1),
  invoiceId: z.string().optional(),
  expenseId: z.string().optional(),
  reference: z.string().optional(),
});

type BudgetCategoryRecord = {
  id: string;
  allocatedAmount: number;
  spentAmount?: number;
  remainingAmount?: number;
  [key: string]: unknown;
};

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const body = await req.json();
    const validated = recordActualSchema.parse(body);
    const actualDate = new Date(validated.date);

    if (Number.isNaN(actualDate.getTime())) {
      throw new AppError({
        message: 'Invalid actual date',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const budgetRef = adminDb.collection('budgets').doc(validated.budgetId);
    const actualRef = adminDb.collection('budget_actuals').doc();

    await adminDb.runTransaction(async (tx) => {
      const budgetSnap = await tx.get(budgetRef);
      if (!budgetSnap.exists) {
        throw new AppError({
          message: 'Budget not found',
          code: 'NOT_FOUND',
          status: 404,
        });
      }

      const budgetData = budgetSnap.data();
      if (!budgetData || budgetData.tenantId !== auth.user.tenantId) {
        throw new AppError({
          message: 'Forbidden',
          code: 'FORBIDDEN',
          status: 403,
        });
      }

      const categories = ((budgetData.categories as BudgetCategoryRecord[] | undefined) || []).map(
        (category) => ({
          ...category,
        }),
      );
      const categoryIndex = categories.findIndex(
        (category) => category.id === validated.categoryId,
      );

      if (categoryIndex === -1) {
        throw new AppError({
          message: 'Budget category not found',
          code: 'NOT_FOUND',
          status: 404,
        });
      }

      const targetCategory = categories[categoryIndex];
      const nextSpentAmount = (targetCategory.spentAmount || 0) + validated.amount;

      categories[categoryIndex] = {
        ...targetCategory,
        spentAmount: nextSpentAmount,
        remainingAmount: targetCategory.allocatedAmount - nextSpentAmount,
      };

      tx.set(actualRef, {
        budgetId: validated.budgetId,
        categoryId: validated.categoryId,
        amount: validated.amount,
        description: validated.description,
        date: actualDate,
        invoiceId: validated.invoiceId || null,
        expenseId: validated.expenseId || null,
        reference: validated.reference || null,
        tenantId: auth.user.tenantId,
        createdAt: serverTimestamp(),
      });

      tx.update(budgetRef, {
        categories,
        updatedAt: serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, actualId: actualRef.id });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/budgets/record-actual' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to record actual spending',
    });
    return NextResponse.json(body, { status });
  }
}
