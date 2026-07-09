import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { ERP_ROLES } from '@/lib/erpAccess';
import { isRoleEnabled } from '@/lib/tenant/access';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // tenantId comes from the authenticated session
  const tenantId = auth.user.tenantId as string;
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant not found in session' }, { status: 403 });
  }

  const callerRole = String(auth.user.role || '').toLowerCase();

  try {
    const { email, password, role, name } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const targetRole = String(role || '').toLowerCase();

    // Role escalation guard: validate against the known role allow-list,
    // block non-super-admins from minting super_admin, and require the role
    // to be enabled for the tenant.
    if (!(ERP_ROLES as readonly string[]).includes(targetRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (targetRole === 'super_admin' && callerRole !== 'super_admin') {
      return NextResponse.json({ error: 'Cannot create super_admin accounts' }, { status: 403 });
    }
    if (targetRole !== 'super_admin') {
      const tenantDoc = await adminDb.collection('tenants').doc(tenantId).get();
      const rolesEnabled = (tenantDoc.data()?.rolesEnabled || {}) as Record<string, boolean>;
      if (!isRoleEnabled(rolesEnabled, targetRole)) {
        return NextResponse.json(
          { error: 'This role is not enabled for your workspace.' },
          { status: 400 },
        );
      }
    }

    // Plan seat limit (Starter 10 / Pro 20 / Enterprise unlimited).
    const seatCheck = await checkUserLimit(tenantId, targetRole);
    if (!seatCheck.ok) {
      return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
    }

    // 1. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name || '',
    });

    // 2. Set custom claims — role AND tenantId required for Firestore rules and middleware
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: targetRole, tenantId });

    // 3. Store user document in Firestore with tenantId
    await adminDb
      .collection('users')
      .doc(userRecord.uid)
      .set({
        uid: userRecord.uid,
        email,
        name: name || '',
        role: targetRole,
        tenantId,
        status: 'active',
        createdAt: Date.now(),
      });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (err: any) {
    console.error('Create user failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
