import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { createDataExportRequest } from '@/lib/compliance/data-retention';

export const runtime = 'nodejs';

const bodySchema = z.object({
  subjectUserId: z.string().min(1),
  format: z.enum(['json', 'csv']).default('json'),
});

function canManageCompliance(role?: string | null) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'owner';
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageCompliance(me.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const result = await createDataExportRequest({
    tenantId: me.tenantId,
    requestedBy: me.uid,
    subjectUserId: parsed.data.subjectUserId,
    format: parsed.data.format,
  });

  const contentType = parsed.data.format === 'csv' ? 'text/csv' : 'application/json';
  return new Response(result.content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename=gdpr-export-${parsed.data.subjectUserId}.${parsed.data.format}`,
    },
  });
}
