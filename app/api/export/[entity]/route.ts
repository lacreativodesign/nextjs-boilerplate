import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { BulkExportService } from '@/lib/export/bulk-export';

const schema = z.object({
  format: z.enum(['csv', 'excel']),
  scope: z.enum(['all', 'current_page']).default('all'),
  fields: z.array(z.object({ sourceField: z.string().min(1), label: z.string().min(1) })).min(1),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: z.literal('eq'),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
    )
    .optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  pageCursor: z.string().optional(),
});

const entitySchema = z.enum([
  'clients',
  'invoices',
  'products',
  'employees',
  'projects',
  'tasks',
  'time_entries',
]);

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { entity: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const entity = entitySchema.parse(params.entity);
    const config = schema.parse(await request.json());

    const jobId = await BulkExportService.createExportJob({
      tenantId: me.tenantId,
      userId: me.uid,
      entity,
      config,
    });

    const result = await BulkExportService.runExportJob({ jobId, tenantId: me.tenantId });

    return NextResponse.json({ ok: true, jobId, ...result });
  } catch (error) {
    console.error('Export error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 400 },
    );
  }
}
