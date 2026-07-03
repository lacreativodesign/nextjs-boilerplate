import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance, toISO } from '../../_utils';
import { executeMonitoredQuery, getPageSize } from '@/lib/firestore/query-performance';

export const dynamic = 'force-dynamic';

type ExpenseDoc = {
  category?: string;
  vendor?: string;
  currency?: string;
  amountPkr?: number;
  expenseDate?: any;
  status?: string;
  notes?: string | null;
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
      .collection('expenses')
      .where('tenantId', '==', auth.user.tenantId)
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(pageSize);

    if (cursor) {
      const cursorDoc = await adminDb.collection('expenses').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await executeMonitoredQuery(() => query.get(), {
      route: 'GET /api/finance/expenses/list',
      tenantId: auth.user.tenantId,
      queryName: 'finance_expenses_list',
      metadata: { limit: pageSize, cursor: cursor || null },
    });

    const expenses = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as ExpenseDoc;
      return {
        id: doc.id,
        category: data.category || '',
        vendor: data.vendor || '',
        currency: data.currency || 'USD',
        amountPkr: Number(data.amountPkr || 0),
        expenseDate: toISO(data.expenseDate),
        status: data.status || 'Recorded',
        notes: data.notes || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      expenses,
      pagination: {
        limit: pageSize,
        nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null,
      },
    });
  } catch (err: any) {
    console.error('finance/expenses list error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to load expenses.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
