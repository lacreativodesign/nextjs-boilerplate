import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { generateComplianceReport } from '@/lib/compliance/data-retention';

export const runtime = 'nodejs';

const bodySchema = z.object({
  type: z.enum(['summary', 'gdpr', 'retention', 'audit']).default('summary'),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await generateComplianceReport({
    tenantId: me.tenantId,
    type: parsed.data.type,
    periodStart: new Date(parsed.data.periodStart),
    periodEnd: new Date(parsed.data.periodEnd),
    generatedBy: me.uid,
  });

  return NextResponse.json(result, { status: 201 });
}
