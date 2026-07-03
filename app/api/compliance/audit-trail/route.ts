import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { exportAuditTrail } from '@/lib/compliance/data-retention';

export const runtime = 'nodejs';

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).default('csv'),
});

function canManageCompliance(role?: string | null) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'owner';
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageCompliance(me.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const params = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!params.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });

  const result = await exportAuditTrail({
    tenantId: me.tenantId,
    startDate: params.data.startDate ? new Date(params.data.startDate) : undefined,
    endDate: params.data.endDate ? new Date(params.data.endDate) : undefined,
    format: params.data.format,
  });

  if (result.format === 'csv') {
    return new Response(result.content, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="audit-trail.csv"',
      },
    });
  }

  return new Response(result.content, {
    headers: { 'Content-Type': 'application/json' },
  });
}
