import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '../../_utils';
import { normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';

export const dynamic = 'force-dynamic';

function toCSV(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const docs = await queryWithTenant(
      adminDb.collection('expenses').where('isDeleted', '==', false).limit(500),
      tenantId,
    );
    const totals = new Map<string, number>();

    docs.forEach((doc) => {
      const data = doc.data() || {};
      const category = String(data.category || 'Other');
      totals.set(category, (totals.get(category) || 0) + Number(data.amountPkr || 0));
    });

    const rows = [['Category', 'Expenses PKR']];
    Array.from(totals.entries()).forEach(([category, total]) => {
      rows.push([category, total.toFixed(0)]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=finance-expenses-by-category.csv',
      },
    });
  } catch (err: any) {
    console.error('finance/reports expenses-by-category error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to export report.' }, { status: 500 });
  }
}
