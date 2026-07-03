import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance, serverTimestamp } from '../../_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const setStatusSchema = z.object({
  templateId: z.string().min(1),
  status: z.enum(['active', 'paused', 'cancelled']),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const body = await req.json();
    const validated = setStatusSchema.parse(body);

    const docRef = adminDb.collection('recurring_invoice_templates').doc(validated.templateId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError({
        message: 'Template not found',
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

    await docRef.update({
      status: validated.status,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/recurring-invoices/set-status' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to update template status',
    });
    return NextResponse.json(body, { status });
  }
}
