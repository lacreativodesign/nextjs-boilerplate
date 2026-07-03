import { NextResponse } from 'next/server';
import { requireFinance } from '@/app/api/finance/_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { adminDb } from '@/lib/firebaseAdmin';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const { budgetId } = (await req.json()) as { budgetId?: string };

    if (!budgetId) {
      throw new AppError({
        message: 'Budget ID is required',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const docRef = adminDb.collection('budgets').doc(budgetId);
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

    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/budgets/delete' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to delete budget',
    });
    return NextResponse.json(body, { status });
  }
}
