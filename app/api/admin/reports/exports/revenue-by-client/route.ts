import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireReportsAccess, toMillis } from '../../_utils';
import { normalizeInvoiceStatus } from '@/lib/finance/status';
import { toCSV, toExcel, toPDF } from '@/lib/exports/formatters';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom = parseDate(searchParams.get('dateFrom'));
    const dateTo = parseDate(searchParams.get('dateTo'), true);
    const format = searchParams.get('format') || 'csv';

    const snap = await adminDb
      .collection('invoices')
      .where('tenantId', '==', auth.user.tenantId)
      .where('isDeleted', '==', false)
      .limit(500)
      .get();
    const totals = new Map<string, number>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (normalizeInvoiceStatus(data.status) !== 'paid') return;
      const paidMs = toMillis(data.paidAt || data.updatedAt || data.createdAt);
      if (dateFrom && (!paidMs || paidMs < dateFrom.getTime())) return;
      if (dateTo && (!paidMs || paidMs > dateTo.getTime())) return;
      const client = String(data.clientName || 'Unknown');
      totals.set(client, (totals.get(client) || 0) + Number(data.amountTotalUsd || 0));
    });

    const rows = [['Client', 'Revenue USD']];
    Array.from(totals.entries()).forEach(([client, total]) => {
      rows.push([client, total.toFixed(2)]);
    });

    if (format === 'xlsx') {
      const buffer = await toExcel(rows, 'Revenue by Client');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=reports-revenue-by-client.xlsx',
        },
      });
    } else if (format === 'pdf') {
      const buffer = await toPDF(rows, 'Revenue by Client');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=reports-revenue-by-client.pdf',
        },
      });
    } else {
      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=reports-revenue-by-client.csv',
        },
      });
    }
  } catch (err: any) {
    console.error('reports/exports revenue-by-client error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to export report.' }, { status: 500 });
  }
}
