import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBulkDataAccess } from '@/lib/api/bulk-data-guard';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBulkDataAccess();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const me = auth.user;

    const doc = await adminDb.collection('importJobs').doc(params.id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = doc.data() || {};
    if (data.tenantId !== me.tenantId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({
      id: doc.id,
      status: data.status,
      progress: data.progress,
      processedRows: data.processedRows,
      totalRows: data.totalRows,
      summary: data.summary || null,
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    console.error('Import status error', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
