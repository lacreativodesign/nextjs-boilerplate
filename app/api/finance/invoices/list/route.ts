import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance, toISO } from '../../_utils';
import { toInvoiceStatusLabel } from '@/lib/finance/status';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';
import { executeMonitoredQuery, getPageSize } from '@/lib/firestore/query-performance';

export const dynamic = 'force-dynamic';

type InvoiceDoc = {
  orderId?: string;
  clientId?: string;
  clientName?: string;
  currency?: string;
  amountSubtotal?: number;
  amountTax?: number;
  amountTotal?: number;
  amountSubtotalUsd?: number;
  amountTaxUsd?: number;
  amountTotalUsd?: number;
  exchangeRateDate?: string;
  totalUSD?: number;
  status?: string;
  dueDate?: any;
  issuedAt?: any;
  paidAt?: any;
  lineItems?: any[];
  notes?: string | null;
  paymentToken?: string;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const pageSize = getPageSize(searchParams.get('limit'));

    let query: FirebaseFirestore.Query = adminDb
      .collection('invoices')
      .where('tenantId', '==', auth.user.tenantId)
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(pageSize);

    if (cursor) {
      const cursorDoc = await adminDb.collection('invoices').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await executeMonitoredQuery(() => query.get(), {
      route: 'GET /api/finance/invoices/list',
      tenantId: auth.user.tenantId,
      queryName: 'finance_invoices_list',
      metadata: { limit: pageSize, cursor: cursor || null },
    });

    const invoices = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as InvoiceDoc;
      return {
        id: doc.id,
        orderId: data.orderId || '',
        clientId: data.clientId || '',
        clientName: data.clientName || '',
        currency: data.currency || 'USD',
        amountSubtotal: Number((data.amountSubtotal ?? data.amountSubtotalUsd) || 0),
        amountTax: Number((data.amountTax ?? data.amountTaxUsd) || 0),
        amountTotal: Number((data.amountTotal ?? data.amountTotalUsd) || 0),
        amountSubtotalUsd: Number(data.amountSubtotalUsd || 0),
        amountTaxUsd: Number(data.amountTaxUsd || 0),
        amountTotalUsd: Number(data.amountTotalUsd || 0),
        exchangeRateDate: data.exchangeRateDate || null,
        totalUSD: Number((data.totalUSD ?? data.amountTotalUsd) || 0),
        status: toInvoiceStatusLabel(data.status),
        dueDate: toISO(data.dueDate),
        issuedAt: toISO(data.issuedAt),
        paidAt: toISO(data.paidAt),
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        notes: data.notes || null,
        paymentToken: data.paymentToken || '',
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      invoices,
      pagination: {
        limit: pageSize,
        nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null,
      },
      currentUser: {
        uid: auth.user.uid,
        role: auth.user.role,
        name: auth.user.name || auth.user.fullName || auth.user.displayName || '',
      },
    });
  } catch (err: any) {
    logError(err, { route: 'GET /api/finance/invoices/list' });
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const finalError = isIndexError
      ? new AppError({
          message: 'Missing Firestore index.',
          code: 'INTERNAL_SERVER_ERROR',
          status: 500,
        })
      : err;
    const { status, body } = resolveErrorResponse(finalError, {
      fallbackMessage: 'Unable to load invoices.',
      fallbackCode: 'INTERNAL_SERVER_ERROR',
      requestId: req.headers.get('x-request-id') || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
