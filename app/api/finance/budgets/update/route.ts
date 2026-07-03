import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFinance, serverTimestamp } from '@/app/api/finance/_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { adminDb } from '@/lib/firebaseAdmin';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

const updateBudgetSchema = z.object({
  budgetId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'closed', 'revised']).optional(),
  categories: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        allocatedAmount: z.number().min(0),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const body = await req.json();
    const validated = updateBudgetSchema.parse(body);

    const docRef = adminDb.collection('budgets').doc(validated.budgetId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError({
        message: 'Budget not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    const existing = docSnap.data();
    if (!existing || existing.tenantId !== auth.user.tenantId) {
      throw new AppError({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.description !== undefined) updates.description = validated.description;
    if (validated.status !== undefined) updates.status = validated.status;

    if (validated.categories) {
      const totalAmount = validated.categories.reduce((sum, cat) => sum + cat.allocatedAmount, 0);
      updates.categories = validated.categories.map((cat) => ({
        ...cat,
        spentAmount: 0,
        remainingAmount: cat.allocatedAmount,
        percentage: totalAmount > 0 ? (cat.allocatedAmount / totalAmount) * 100 : 0,
      }));
      updates.totalAmount = totalAmount;
    }

    await docRef.update(updates);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/budgets/update' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to update budget',
    });
    return NextResponse.json(body, { status });
  }
}
