import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';
import { createUserSchema } from '@/lib/validations/user';
import { initialPasswordSchema } from '@/lib/validations/user-admin';
import { validateRequest } from '@/lib/validations/validate';
import { syncUserClaims } from '@/lib/auth/sync-user-claims';

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // This legacy endpoint is tenant-scoped. The authenticated tenant is authoritative;
  // callers can never supply a destination tenant or use this surface to mint a
  // platform-level Super Admin.
  const tenantId = String(auth.user.tenantId || '').trim();
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant not found in session' }, { status: 403 });
  }

  let createdUid: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const validated = validateRequest(createUserSchema, {
      email: body?.email,
      displayName: body?.name || body?.displayName,
      role: body?.role,
      tenantId,
    });
    const password = initialPasswordSchema.parse(body?.password);
    const targetRole = validated.role;

    if (targetRole === 'super_admin') {
      return NextResponse.json(
        { error: 'Super Admin accounts cannot be created through a tenant endpoint.' },
        { status: 403 },
      );
    }

    const tenantDoc = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const rolesEnabled = resolveTenantRoles(tenantDoc.data()?.rolesEnabled);
    if (!isRoleEnabled(rolesEnabled, targetRole)) {
      return NextResponse.json(
        { error: 'This role is not enabled for your workspace.' },
        { status: 400 },
      );
    }

    const seatCheck = await checkUserLimit(tenantId, targetRole);
    if (!seatCheck.ok) {
      return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
    }

    const userRecord = await adminAuth.createUser({
      email: validated.email,
      password,
      displayName: validated.displayName,
    });
    createdUid = userRecord.uid;

    try {
      // Keep Firebase Auth claims and the Firestore identity in one provisioning path.
      // If either step fails, the just-created Auth identity is removed below.
      await syncUserClaims({
        uid: userRecord.uid,
        role: targetRole,
        tenantId,
        endSessions: false,
      });

      await adminDb.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: validated.email,
        name: validated.displayName,
        displayName: validated.displayName,
        role: targetRole,
        tenantId,
        status: 'active',
        isActive: true,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.user.uid,
      });
    } catch (provisionError) {
      await adminAuth.deleteUser(userRecord.uid).catch(() => {});
      createdUid = null;
      throw provisionError;
    }

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (err: any) {
    if (createdUid) {
      await adminAuth.deleteUser(createdUid).catch(() => {});
    }
    console.error('Create user failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to create user' }, { status: 400 });
  }
}
