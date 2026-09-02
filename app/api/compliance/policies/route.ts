import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { createRetentionPolicy, listRetentionPolicies } from '@/lib/compliance/data-retention';
import { AuditLogger } from '@/lib/audit/audit-logger';

export const runtime = 'nodejs';

const bodySchema = z.object({
  entityType: z.enum([
    'audit_logs',
    'invoices',
    'expenses',
    'projects',
    'tasks',
    'documents',
    'users',
    'notifications',
    'custom',
  ]),
  collectionPath: z.string().min(1),
  retentionDays: z.number().int().min(1).max(3650),
  action: z.enum(['delete', 'archive']),
  enabled: z.boolean().optional(),
});

function canManageCompliance(role?: string | null) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'owner';
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageCompliance(me.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const policies = await listRetentionPolicies(me.tenantId);
  return NextResponse.json({ policies });
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

  const policy = await createRetentionPolicy({
    tenantId: me.tenantId,
    ...parsed.data,
    createdBy: me.uid,
  });

  // SOC2 F-05 / C1.2: a retention policy is standing authority to destroy records on
  // a schedule. Who created it, against which entity type and at what period is the
  // evidence that the deletions the cron later performs were authorised.
  await AuditLogger.log({
    tenantId: me.tenantId,
    userId: me.uid,
    userEmail: me.email || '',
    userName: me.name || me.email || '',
    action: 'create',
    resource: 'settings',
    resourceId: policy.id,
    changes: [
      { field: 'entityType', oldValue: null, newValue: parsed.data.entityType },
      { field: 'retentionDays', oldValue: null, newValue: parsed.data.retentionDays },
      { field: 'action', oldValue: null, newValue: parsed.data.action },
    ],
    status: 'success',
  });

  return NextResponse.json({ policy }, { status: 201 });
}
