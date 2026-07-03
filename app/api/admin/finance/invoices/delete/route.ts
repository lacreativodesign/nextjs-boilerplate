import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, parseString, serverTimestamp } from '../../_utils';
import { normalizeInvoiceStatus } from '@/lib/finance/status';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const snap = await adminDb.collection('invoices').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const data = snap.data() || {};
    const isSuperAdmin = (auth.user.role || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin && String(data.tenantId || '') !== String(auth.user.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    // Financial immutability: an invoice that has received money must never be deleted (which would
    // erase revenue from reports). Paid / partially-paid invoices can only be voided (with a credit
    // note), preserving the audit record. Draft / issued / void invoices remain deletable.
    const status = normalizeInvoiceStatus(data.status);
    if (status === 'paid' || status === 'partially_paid') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Paid or partially paid invoices cannot be deleted. Void the invoice (a reason is required) instead.',
        },
        { status: 409 },
      );
    }

    await adminDb.collection('invoices').doc(id).set(
      {
        isDeleted: true,
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('finance/invoices delete error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to delete invoice.' }, { status: 500 });
  }
}
