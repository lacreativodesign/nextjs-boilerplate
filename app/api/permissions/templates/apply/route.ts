import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { getPermissionTemplateByKey } from '@/lib/permissions/templates';
import {
  assignRolesToUser,
  invalidateUserPermissionCache,
} from '@/lib/permissions/permission-engine';
import type { RoleDocument } from '@/lib/permissions/types';
import { resolveErrorResponse } from '@/lib/errors';
import { validateRequest } from '@/lib/validations/validate';
import { applyTemplateSchema } from '@/lib/validations/permission';

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    // SOC2 F-06: this route mints a role AND grants it to a user in one call, from a
    // body that was cast rather than validated.
    const body = validateRequest(applyTemplateSchema, await request.json());
    const template = getPermissionTemplateByKey(body.templateKey);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const now = Date.now();
    const roleRef = adminDb.collection('permission_roles').doc();
    const role: RoleDocument = {
      id: roleRef.id,
      tenantId: auth.user.tenantId,
      name: body.roleName || template.name,
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
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Failed to apply template',
    });
    return NextResponse.json(body, { status, headers });
  }
}
