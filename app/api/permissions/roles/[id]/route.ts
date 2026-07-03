import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import {
  assignRolesToUser,
  invalidateUserPermissionCache,
} from '@/lib/permissions/permission-engine';
import type { PermissionSet, RoleDocument } from '@/lib/permissions/types';

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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as Partial<RoleDocument> & { assignedUserIds?: string[] };
    const ref = adminDb.collection('permission_roles').doc(params.id);
    const current = await ref.get();

    if (!current.exists) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const role = current.data() as RoleDocument;
    if (role.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.permissions && !validatePermissions(body.permissions)) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 });
    }

    const nextRole: RoleDocument = {
      ...role,
      name: body.name?.trim() || role.name,
      description: body.description?.trim() ?? role.description,
      parentRoleId: body.parentRoleId ?? role.parentRoleId ?? null,
      permissions: body.permissions || role.permissions,
      updatedAt: Date.now(),
      updatedBy: auth.user.uid,
    };

    await ref.set(nextRole);

    const assignments = await adminDb
      .collection('permission_role_assignments')
      .where('tenantId', '==', auth.user.tenantId)
      .where('roleId', '==', params.id)
      .get();

    await Promise.all(
      assignments.docs.map((doc) =>
        invalidateUserPermissionCache(auth.user.tenantId, doc.data().userId as string),
      ),
    );

    if (Array.isArray(body.assignedUserIds)) {
      await Promise.all(
        body.assignedUserIds.map((userId) =>
          assignRolesToUser({
            tenantId: auth.user.tenantId,
            userId,
            roleIds: [params.id],
            actorUserId: auth.user.uid,
          }),
        ),
      );
    }

    return NextResponse.json({ role: nextRole });
  } catch (error) {
    console.error('Update role error', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}
