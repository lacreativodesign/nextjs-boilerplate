import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { isAdminLike, normalizeRole, requireHrAccess } from '../../_utils';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { createUserSchema } from '@/lib/validations/user';
import { validateRequest } from '@/lib/validations/validate';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';
import { syncUserClaims } from '@/lib/auth/sync-user-claims';

export const runtime = 'nodejs';

/**
 * Creates an employee — which is to say, a tenant user.
 *
 * `users` is the identity model: it is what the Auth uid keys, what custom claims are
 * stamped on, what the roster reads, and what every other module joins against. Account
 * creation is therefore an IAM operation. HR may maintain employee records, but only
 * Admin/Super Admin may create a new login identity.
 */

const HR_CREATABLE_ROLES = [
  'sales_manager',
  'sales',
  'am_manager',
  'am',
  'production_manager',
  'production',
  'finance',
  'hr',
] as const;

export async function POST(req: Request) {
  let createdUid: string | null = null;

  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json(
        { success: false, message: access.error },
        { status: access.status },
      );
    }

    const requesterRole = normalizeRole(access.user.role);
    if (!isAdminLike(requesterRole)) {
      return NextResponse.json(
        { success: false, message: 'Only Admin or Super Admin can create user accounts.' },
        { status: 403 },
      );
    }

    // tenantId comes from the authenticated session, never the request body.
    const tenantId = String(access.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json(
        { success: false, message: 'No tenant is associated with this account.' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));

    const validated = validateRequest(createUserSchema, {
      email: body?.email,
      displayName: String(body?.name || body?.displayName || '').trim(),
      role: String(body?.role || '')
        .trim()
        .toLowerCase(),
      tenantId,
      phone: body?.phone,
      department: body?.department,
    });

    const { email, displayName, role, phone, department } = validated;

    if (!(HR_CREATABLE_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json(
        { success: false, message: 'This surface cannot create an account with that role.' },
        { status: 403 },
      );
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json(
        { success: false, message: 'Tenant not found.' },
        { status: 404 },
      );
    }

    const rolesEnabled = resolveTenantRoles(tenantSnap.data()?.rolesEnabled);
    if (!isRoleEnabled(rolesEnabled, role)) {
      return NextResponse.json(
        {
          success: false,
          message: 'This role is not enabled for your workspace. Contact your administrator.',
        },
        { status: 400 },
      );
    }

    const seatCheck = await checkUserLimit(tenantId, role);
    if (!seatCheck.ok) {
      return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
    }

    const existingUser = await adminAuth.getUserByEmail(email).catch((err: any) => {
      if (err?.code === 'auth/user-not-found') return null;
      throw err;
    });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'A user with this email address already exists.' },
        { status: 409 },
      );
    }

    // Default the reporting line to the tenant admin, matching the admin creation path.
    const adminSnap = await adminDb
      .collection('users')
      .where('tenantId', '==', tenantId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();
    const managerId = adminSnap.empty ? access.user.uid : adminSnap.docs[0].id;

    const userRecord = await adminAuth.createUser({
      email,
      password: crypto.randomBytes(16).toString('hex'),
      displayName,
      disabled: false,
    });
    createdUid = userRecord.uid;

    try {
      await syncUserClaims({
        uid: userRecord.uid,
        role,
        tenantId,
        endSessions: false,
      });

      const nowIso = new Date().toISOString();
      await adminDb
        .collection('users')
        .doc(userRecord.uid)
        .set({
          uid: userRecord.uid,
          name: displayName,
          displayName,
          email,
          role,
          managerId,
          tenantId,
          phone: phone || '',
          department: department || '',
          designation: String(body?.designation || ''),
          status: 'active',
          isActive: true,
          isDeleted: false,
          joiningDate: body?.joiningDate || null,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: access.user.uid,
        });
    } catch (provisionError) {
      await adminAuth.deleteUser(userRecord.uid).catch(() => {});
      createdUid = null;
      throw provisionError;
    }

    const tokenData = await createPasswordSetupToken({
      uid: userRecord.uid,
      email,
      createdBy: access.user.uid,
    });

    const emailResult = await sendSetPasswordEmail({ email, link: tokenData.link });

    const notifyTargets = await getUsersByRoles(['admin', 'super_admin', 'hr'], tenantId);
    await createNotifications({
      recipients: notifyTargets,
      tenantId,
      type: 'info',
      title: 'New employee added',
      message: `${displayName} was added to ${department || role}.`,
      entityType: 'hr',
      entityId: userRecord.uid,
      deepLink: '/hr/employees',
    });

    return NextResponse.json(
      {
        success: true,
        uid: userRecord.uid,
        emailSent: emailResult.sent,
        emailError: emailResult.sent ? undefined : emailResult.error,
        message: 'Employee created. An invitation to set a password has been emailed to them.',
      },
      { status: 200 },
    );
  } catch (err: any) {
    if (createdUid) {
      await adminAuth.deleteUser(createdUid).catch(() => {});
    }
    console.error('Error creating employee:', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    return NextResponse.json(
      {
        success: false,
        message:
          err?.code === 'auth/email-already-exists'
            ? 'A user with this email address already exists.'
            : err?.message || 'Server error',
      },
      { status },
    );
  }
}
