import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const doc = await adminDb.collection('exportJobs').doc(params.id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = doc.data() || {};
    if (data.tenantId !== me.tenantId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (data.status !== 'completed')
      return NextResponse.json({ error: 'Export is not completed' }, { status: 409 });

    return NextResponse.json({
      id: doc.id,
      status: data.status,
      fileName: data.fileName,
      downloadUrl: data.signedUrl,
      totalRows: data.totalRows,
      processedRows: data.processedRows,
    });
  } catch (error) {
    console.error('Export download error', error);
    return NextResponse.json({ error: 'Failed to fetch export file' }, { status: 500 });
  }
}
