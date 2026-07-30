import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireReportsAccess, toISO } from '../../_utils';
import { toCSV, toExcel, toPDF } from '@/lib/exports/formatters';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';

    const [snap, altSnap] = await Promise.all([
      adminDb
        .collection('changeRequests')
        .where('tenantId', '==', auth.user.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      adminDb
        .collection('changeRequests')
        .where('tenantId', '==', auth.user.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
    ]);

    const rows = [['Change Request', 'Client', 'Status', 'Created At']];
    [...snap.docs, ...altSnap.docs].forEach((doc) => {
      const data = doc.data() || {};
      rows.push([
        String(data.title || data.name || doc.id),
        String(data.clientName || 'Unknown'),
        String(data.status || 'Open'),
        toISO(data.createdAt) || '',
      ]);
    });

    if (format === 'xlsx') {
      const buffer = await toExcel(rows, 'Change Requests');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=reports-change-requests.xlsx',
        },
      });
    } else if (format === 'pdf') {
      const buffer = await toPDF(rows, 'Change Requests');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=reports-change-requests.pdf',
        },
      });
    } else {
      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=reports-change-requests.csv',
        },
      });
    }
  } catch (err: any) {
    console.error('reports/exports change-requests error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to export report.' }, { status: 500 });
  }
}
