import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance } from '../../_utils';
import { normalizeInvoiceStatus } from '@/lib/finance/status';

export const dynamic = 'force-dynamic';

function toCSV(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId || '';
    const snap = await adminDb
      .collection('invoices')
      .where('tenantId', '==', tenantId)
      .where('isDeleted', '==', false)
      .limit(500)
      .get();
    const totals = new Map<string, number>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (normalizeInvoiceStatus(data.status) !== 'paid') return;
      const client = String(data.clientName || 'Unknown');
      totals.set(client, (totals.get(client) || 0) + Number(data.amountTotalUsd || 0));
    });

    const rows = [['Client', 'Revenue USD']];
    Array.from(totals.entries()).forEach(([client, total]) => {
      rows.push([client, total.toFixed(2)]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=finance-revenue-by-client.csv',
      },
    });
  } catch (err: any) {
    console.error('finance/reports revenue-by-client error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to export report.' }, { status: 500 });
  }
}
