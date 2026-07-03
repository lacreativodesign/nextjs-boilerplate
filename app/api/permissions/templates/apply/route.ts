import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { getPermissionTemplateByKey } from '@/lib/permissions/templates';
import {
  assignRolesToUser,
  invalidateUserPermissionCache,
} from '@/lib/permissions/permission-engine';
import type { RoleDocument } from '@/lib/permissions/types';

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      templateKey?: string;
      roleName?: string;
      userId?: string;
    };
    const template = getPermissionTemplateByKey(body.templateKey || '');

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const now = Date.now();
    const roleRef = adminDb.collection('permission_roles').doc();
    const role: RoleDocument = {
      id: roleRef.id,
      tenantId: auth.user.tenantId,
      name: body.roleName?.trim() || template.name,
      description: template.description,
      parentRoleId: template.parentRoleId || null,
      permissions: template.permissions,
      isTemplate: true,
      createdBy: auth.user.uid,
      updatedBy: auth.user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await roleRef.set(role);

    if (body.userId) {
      await assignRolesToUser({
        tenantId: auth.user.tenantId,
        userId: body.userId,
        roleIds: [role.id],
        actorUserId: auth.user.uid,
      });
      await invalidateUserPermissionCache(auth.user.tenantId, body.userId);
    }

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error('Apply template error', error);
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 });
  }
}
