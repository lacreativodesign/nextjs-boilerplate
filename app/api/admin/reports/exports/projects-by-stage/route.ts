import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeStage, requireReportsAccess } from '../../_utils';
import { toCSV, toExcel, toPDF } from '@/lib/exports/formatters';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PIPELINE_STAGES = [
  'Deposit',
  'Kickoff',
  'Draft',
  'Review',
  'Revisions',
  'Final',
  'Delivered',
];

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';

    const snap = await adminDb
      .collection('projects')
      .where('tenantId', '==', auth.user.tenantId)
      .where('isDeleted', '==', false)
      .limit(500)
      .get();
    const totals = new Map<string, number>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const stage = normalizeStage(data.stage);
      totals.set(stage, (totals.get(stage) || 0) + 1);
    });

    const rows = [['Stage', 'Projects']];
    PIPELINE_STAGES.forEach((stage) => {
      rows.push([stage, String(totals.get(stage) || 0)]);
    });

    if (format === 'xlsx') {
      const buffer = await toExcel(rows, 'Projects by Stage');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=reports-projects-by-stage.xlsx',
        },
      });
    } else if (format === 'pdf') {
      const buffer = await toPDF(rows, 'Projects by Stage');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=reports-projects-by-stage.pdf',
        },
      });
    } else {
      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=reports-projects-by-stage.csv',
        },
      });
    }
  } catch (err: any) {
    console.error('reports/exports projects-by-stage error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to export report.' }, { status: 500 });
  }
}
