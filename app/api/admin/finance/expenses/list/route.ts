import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, toISO } from '../../_utils';
import { normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';

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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 500);
    const cursor = req.nextUrl.searchParams.get('cursor');

    let baseQuery: FirebaseFirestore.Query = adminDb
      .collection('expenses')
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await adminDb.collection('expenses').doc(cursor).get();
      if (cursorDoc.exists && normalizeTenantId(cursorDoc.data()?.tenantId) === tenantId) {
        baseQuery = baseQuery.startAfter(cursorDoc);
      }
    }

    const rawDocs = await queryWithTenant(baseQuery, tenantId);

    rawDocs.sort((a, b) => {
      const aMs = a.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bMs = b.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bMs - aMs;
    });

    const hasMore = rawDocs.length > limit;
    const pageDocs = rawDocs.slice(0, limit);

    const expenses = pageDocs.map((doc) => {
      const data = (doc.data() || {}) as ExpenseDoc;
      return {
        id: doc.id,
        category: data.category || '',
        vendor: data.vendor || '',
        currency: data.currency || 'PKR',
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
        hasMore,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
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
