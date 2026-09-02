import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import type { RoleDocument } from '@/lib/permissions/types';
import { resolveErrorResponse } from '@/lib/errors';
import { validateRequest } from '@/lib/validations/validate';
import { createRoleSchema } from '@/lib/validations/permission';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    // SOC2 F-06: the hand-rolled check this replaces tested `Array.isArray(actions)`
    // without inspecting the array's contents, so arbitrary objects could be stored
    // as permission actions. Nothing bounded the number of entries or the length of
    // a name either. The schema draws its enums from the same constants the
    // permission engine evaluates, so an action it cannot understand cannot be
    // persisted in the first place.
    const body = validateRequest(createRoleSchema, await request.json());

    const now = Date.now();
    const ref = adminDb.collection('permission_roles').doc();

    const role: RoleDocument = {
      id: ref.id,
      tenantId: auth.user.tenantId,
      name: body.name,
      description: body.description ?? '',
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
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Failed to create role',
    });
    return NextResponse.json(body, { status, headers });
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
