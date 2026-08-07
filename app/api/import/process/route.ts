import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBulkDataAccess } from '@/lib/api/bulk-data-guard';
import { BulkImportService } from '@/lib/import/bulk-import';

const schema = z.object({
  jobId: z.string().min(1),
  rollbackOnCritical: z.boolean().optional(),
});

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBulkDataAccess();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const me = auth.user;

    const payload = schema.parse(await request.json());
    const result = await BulkImportService.processJob({
      jobId: payload.jobId,
      tenantId: me.tenantId,
      userId: me.uid,
      rollbackOnCritical: payload.rollbackOnCritical,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Import process error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Process failed' },
      { status: 400 },
    );
  }
}
