import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance } from '../../_utils';
import { resolveErrorResponse } from '@/lib/errors';
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
    const status = searchParams.get('status');
    const clientId = searchParams.get('clientId');
    const activeOnly = searchParams.get('active') === 'true';

    let query = adminDb
      .collection('recurring_invoice_templates')
      .where('tenantId', '==', auth.user.tenantId);

    if (status) {
      query = query.where('status', '==', status);
    }

    if (clientId) {
      query = query.where('clientId', '==', clientId);
    }

    type DocRecord = { id: string } & Record<string, any>;
    const snapshot = await query.orderBy('createdAt', 'desc').get();
    const templates = (
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as DocRecord[]
    ).filter((template) => (activeOnly ? template.status === 'active' : true));

    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    logError(err, { route: 'GET /api/finance/recurring-invoices/list' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to fetch recurring invoice templates',
    });
    return NextResponse.json(body, { status });
  }
}
