import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBulkDataAccess } from '@/lib/api/bulk-data-guard';
import {
  mintProtectedDownloadUrl,
  ProtectedDownloadRefused,
  protectedDownloadError,
} from '@/lib/storage/protected-download';

export const runtime = 'nodejs';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireBulkDataAccess();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const me = auth.user;

    const doc = await adminDb.collection('exportJobs').doc(params.id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = doc.data() || {};
    if (data.tenantId !== me.tenantId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (data.status !== 'completed')
      return NextResponse.json({ error: 'Export is not completed' }, { status: 409 });

    // P0-07: minted now, for this authorized caller, and never stored. The job used to
    // hand back the 1-hour URL written when the export ran, to anyone who read the job.
    const minted = await mintProtectedDownloadUrl({
      storagePath: String(data.storagePath || ''),
      tenantId: me.tenantId,
      allowedRoots: [`tenants/${me.tenantId}/exports/`],
      fileName: String(data.fileName || 'export'),
    });

    return NextResponse.json({
      id: doc.id,
      status: data.status,
      fileName: data.fileName,
      downloadUrl: minted.url,
      expiresAt: minted.expiresAt,
      totalRows: data.totalRows,
      processedRows: data.processedRows,
    });
  } catch (error) {
    if (error instanceof ProtectedDownloadRefused) return protectedDownloadError(error, 'export');
    console.error('Export download error', { name: (error as Error | null)?.name });
    return NextResponse.json({ error: 'Failed to fetch export file' }, { status: 500 });
  }
}
