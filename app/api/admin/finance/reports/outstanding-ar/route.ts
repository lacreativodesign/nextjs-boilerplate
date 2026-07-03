import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, toISO } from '../../_utils';
import { normalizeInvoiceStatus, toInvoiceStatusLabel } from '@/lib/finance/status';
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
      adminDb.collection('invoices').where('isDeleted', '==', false).limit(500),
      tenantId,
    );
    const rows = [['Invoice', 'Client', 'Amount USD', 'Due Date', 'Status']];

    docs.forEach((doc) => {
      const data = doc.data() || {};
      const normalizedStatus = normalizeInvoiceStatus(data.status);
      if (['paid', 'void'].includes(normalizedStatus)) return;
      rows.push([
        String(data.orderId || doc.id),
        String(data.clientName || ''),
        Number(data.amountTotalUsd || 0).toFixed(2),
        toISO(data.dueDate) || '',
        toInvoiceStatusLabel(normalizedStatus),
      ]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=finance-outstanding-ar.csv',
      },
    });
  } catch (err: any) {
    console.error('finance/reports outstanding-ar error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to export report.' }, { status: 500 });
  }
}
