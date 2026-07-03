import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance } from '../../_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('templateId');

    if (!templateId) {
      throw new AppError({
        message: 'Template ID is required',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const templateSnap = await adminDb
      .collection('recurring_invoice_templates')
      .doc(templateId)
      .get();
    if (!templateSnap.exists) {
      throw new AppError({
        message: 'Template not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    const templateData = templateSnap.data();
    if (!templateData || templateData.tenantId !== auth.user.tenantId) {
      throw new AppError({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const historySnap = await adminDb
      .collection('generated_invoices')
      .where('templateId', '==', templateId)
      .where('tenantId', '==', auth.user.tenantId)
      .orderBy('generatedDate', 'desc')
      .limit(50)
      .get();

    const history = historySnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ ok: true, history });
  } catch (err) {
    logError(err, { route: 'GET /api/finance/recurring-invoices/history' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to fetch generation history',
    });
    return NextResponse.json(body, { status });
  }
}
