import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import type { PermissionSet, RoleDocument } from '@/lib/permissions/types';

export const dynamic = 'force-dynamic';

function validatePermissions(payload: unknown): payload is PermissionSet[] {
  if (!Array.isArray(payload)) return false;
  return payload.every((permission) => {
    const item = permission as PermissionSet;
    return (
      !!item &&
      typeof item.module === 'string' &&
      typeof item.entity === 'string' &&
      Array.isArray(item.actions)
    );
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as Partial<RoleDocument>;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }

    if (!validatePermissions(body.permissions)) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 });
    }

    const now = Date.now();
    const ref = adminDb.collection('permission_roles').doc();

    const role: RoleDocument = {
      id: ref.id,
      tenantId: auth.user.tenantId,
      name: body.name.trim(),
      description: body.description?.trim() || '',
      permissions: body.permissions,
      parentRoleId: body.parentRoleId || null,
      isTemplate: false,
      createdBy: auth.user.uid,
      updatedBy: auth.user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(role);

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error('Create role error', error);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const snapshot = await adminDb
      .collection('permission_roles')
      .where('tenantId', '==', auth.user.tenantId)
      .orderBy('name', 'asc')
      .get();

    const roles = snapshot.docs.map((doc) => doc.data() as RoleDocument);
    return NextResponse.json({ roles });
  } catch (error) {
    console.error('List roles error', error);
    return NextResponse.json({ error: 'Failed to list roles' }, { status: 500 });
  }
}
