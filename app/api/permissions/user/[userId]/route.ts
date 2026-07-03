import { NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { buildUserPermissionSnapshot } from '@/lib/permissions/permission-engine';

export async function GET(_: Request, { params }: { params: { userId: string } }) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const permissions = await buildUserPermissionSnapshot(auth.user.tenantId, params.userId);
    return NextResponse.json(permissions);
  } catch (error) {
    console.error('Get user permissions error', error);
    return NextResponse.json({ error: 'Failed to fetch user permissions' }, { status: 500 });
  }
}
