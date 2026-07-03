import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance, toISO } from '../../_utils';

export const dynamic = 'force-dynamic';

type PayrollDoc = {
  userId?: string;
  userName?: string;
  role?: string;
  currency?: string;
  baseSalaryPkr?: number;
  commissionPkr?: number | null;
  commissionUsd?: number | null;
  month?: string;
  status?: string;
  paidAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection('payroll')
      .where('tenantId', '==', auth.user.tenantId)
      .where('isDeleted', '==', false)
      .limit(500)
      .get();

    const payroll = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as PayrollDoc;
      return {
        id: doc.id,
        userId: data.userId || '',
        userName: data.userName || '',
        role: data.role || '',
        currency: data.currency || 'USD',
        baseSalaryPkr: Number(data.baseSalaryPkr || 0),
        commissionPkr: data.commissionPkr == null ? null : Number(data.commissionPkr || 0),
        commissionUsd: data.commissionUsd == null ? null : Number(data.commissionUsd || 0),
        month: data.month || '',
        status: data.status || 'Draft',
        paidAt: toISO(data.paidAt),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      payroll,
      currentUser: {
        uid: auth.user.uid,
        role: auth.user.role,
        name: auth.user.name || auth.user.fullName || auth.user.displayName || '',
      },
    });
  } catch (err: any) {
    console.error('finance/payroll list error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to load payroll.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
