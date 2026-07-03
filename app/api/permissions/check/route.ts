import { NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { checkPermission } from '@/lib/permissions/permission-engine';
import type { PermissionCheckInput } from '@/lib/permissions/types';

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as Omit<PermissionCheckInput, 'tenantId'>;
    if (!body.userId || !body.module || !body.entity || !body.action) {
      return NextResponse.json(
        { error: 'userId, module, entity and action are required' },
        { status: 400 },
      );
    }

    const result = await checkPermission({
      ...body,
      tenantId: auth.user.tenantId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Check permission error', error);
    return NextResponse.json({ error: 'Failed to check permission' }, { status: 500 });
  }
}
