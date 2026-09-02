import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { createDataDeletionRequest, TenantOwnershipError } from '@/lib/compliance/data-retention';
import { AuditLogger } from '@/lib/audit/audit-logger';

export const runtime = 'nodejs';

const bodySchema = z.object({
  subjectUserId: z.string().min(1),
  mode: z.enum(['anonymize', 'delete']).default('anonymize'),
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

  try {
    const result = await createDataDeletionRequest({
      tenantId: me.tenantId,
      requestedBy: me.uid,
      subjectUserId: parsed.data.subjectUserId,
      mode: parsed.data.mode,
    });
    // SOC2 F-05 / P4.2: erasure is irreversible. The audit entry is written AFTER the
    // erasure succeeds, so the trail records what actually happened rather than what
    // was attempted — a failed run throws before reaching here and leaves no false
    // record of a deletion that never occurred.
    await AuditLogger.log({
      tenantId: me.tenantId,
      userId: me.uid,
      userEmail: me.email || '',
      userName: me.name || me.email || '',
      action: parsed.data.mode === 'delete' ? 'delete' : 'update',
      resource: 'user',
      resourceId: parsed.data.subjectUserId,
      changes: [{ field: 'dsar.erasure', oldValue: null, newValue: parsed.data.mode }],
      status: 'success',
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof TenantOwnershipError) {
      return NextResponse.json({ error: 'Subject user not found' }, { status: 404 });
    }
    throw error;
  }
}
