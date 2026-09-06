import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole } from '../_utils';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { createUserSchema } from '@/lib/validations/user';
import { adminCreateUserProfileSchema } from '@/lib/validations/user-admin';
import { validateRequest } from '@/lib/validations/validate';
import { checkRateLimit } from '@/lib/security';
import { logEvent } from '@/lib/audit';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { sendEmail } from '@/lib/email/email-service';
import { getUsersByRoles } from '@/lib/notifications';
import { eligibleManagerRolesFor } from '@/lib/hierarchy';
import { planLimitResponseBody } from '@/lib/billing/user-limit';
import { releaseStaffSeat, reserveStaffSeat } from '@/lib/billing/seat-reservation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // 1) Get current logged-in user from existing util
    const current = await getCurrentUser();
    if (!current) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const currentRole = (current.role || '').toLowerCase();

    // 2) Only admin / super_admin / other privileged roles allowed
    if (!isAdminRole(currentRole)) {
      return NextResponse.json({ error: 'Only admin users can create new users' }, { status: 403 });
    }

    try {
      assertPermission(currentRole, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await checkRateLimit(req, 'standard', current.uid);

    // 3) Parse body
    const body = await req.json();
    const displayNameInput = String(body?.name || body?.fullName || body?.displayName || '').trim();

    const validatedData = validateRequest(createUserSchema, {
      email: body?.email,
      displayName: displayNameInput,
      role: body?.role,
      tenantId: current.tenantId || '',
      phone: body?.phone,
      department: body?.department,
      managerId: body?.managerId,
    });

    const {
      email,
      displayName,
      role,
      tenantId,
      phone,
      department,
      managerId: rawManagerId,
    } = validatedData;

    // SOC2 F-06: these nine fields were destructured straight off the raw body and
    // written to Firestore, while the seven above them went through a schema. That is
    // worse than no validation, because the route reads as though its input is
    // checked. `password` in particular was used verbatim as the initial credential
    // with no policy, so the weakest passwords in the system were the ones handed out
    // by administrators — while a user changing their own password had to satisfy
    // changePasswordSchema.
    const {
      password,
      designation,
      salary,
      monthlyTarget,
      commission,
      joiningDate,
      cnic,
      dob,
      status,
    } = validateRequest(adminCreateUserProfileSchema, body || {});

    try {
      assertPermission(currentRole, Permission.ManageRoles);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (role === 'super_admin' && currentRole !== 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Cannot create super_admin accounts' },
        { status: 403 },
      );
    }

    if (!canManageRole(role)) {
      return NextResponse.json({ error: 'Permission denied for selected role' }, { status: 403 });
    }

    const targetRole = (role || '').toLowerCase();
    const passwordToUse = String(password || '').trim() || crypto.randomBytes(16).toString('hex');

    const tenantDoc = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const rolesEnabled = resolveTenantRoles(tenantDoc.data()?.rolesEnabled);
    if (!isRoleEnabled(rolesEnabled, targetRole)) {
      return NextResponse.json(
        { error: 'This role is not enabled for your workspace. Contact your administrator.' },
        { status: 400 },
      );
    }

    // Resolve managerId: validate if provided, else default to tenant admin uid
    let managerId: string;
    if (rawManagerId) {
      const managerSnap = await adminDb.collection('users').doc(rawManagerId).get();
      if (!managerSnap.exists) {
        return NextResponse.json({ error: 'Invalid manager selection.' }, { status: 400 });
      }
      const managerData = managerSnap.data() || {};
      if (String(managerData.tenantId || '') !== String(tenantId)) {
        return NextResponse.json({ error: 'Invalid manager selection.' }, { status: 400 });
      }
      const eligibleRoles = eligibleManagerRolesFor(targetRole);
      if (!eligibleRoles.includes(String(managerData.role || ''))) {
        return NextResponse.json({ error: 'Invalid manager selection.' }, { status: 400 });
      }
      managerId = rawManagerId;
    } else {
      const adminSnap = await adminDb
        .collection('users')
        .where('tenantId', '==', tenantId)
        .where('role', '==', 'admin')
        .limit(1)
        .get();
      managerId = adminSnap.empty ? current.uid : adminSnap.docs[0].id;
    }

    // 5) Check duplicate email
    const existingUser = await adminAuth.getUserByEmail(email).catch((err: any) => {
      if (err?.code === 'auth/user-not-found') {
        return null;
      }
      throw err;
    });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // Plan seat limit (Starter 10 / Pro 20 / Enterprise unlimited). Client portal users
    // are not staff seats and are never limited here. The reservation is atomic and is
    // held until the identity itself is committed, so two concurrent creations cannot
    // both take the tenant's last free seat.
    const seat = await reserveStaffSeat(tenantId, targetRole, 'admin_create');
    if (!seat.ok) {
      return NextResponse.json(planLimitResponseBody(seat), { status: 403 });
    }

    let userRecord;
    try {
      // 6) Create Firebase Auth user
      userRecord = await adminAuth.createUser({
        email,
        password: passwordToUse,
        displayName,
        disabled: status === 'disabled',
      });

      try {
        // 7) Assign custom claims. Firestore security rules read the claim, so it is
        // installed BEFORE the identity document is published; an account is never
        // observable with a tenant record and no RBAC enforcement-plane claim.
        await adminAuth.setCustomUserClaims(userRecord.uid, { role: targetRole, tenantId });

        // 8) Save user document in Firestore
        await adminDb
          .collection('users')
          .doc(userRecord.uid)
          .set({
            uid: userRecord.uid,
            name: displayName,
            email,
            role: targetRole,
            managerId,
            tenantId,
            phone: phone || '',
            department: department || '',
            designation: designation || '',
            salary: salary ?? null,
            monthlyTarget: monthlyTarget ?? null,
            commission: commission ?? null,
            joiningDate: joiningDate || null,
            status: status || 'active',
            isActive: status !== 'disabled',
            cnic: cnic || '',
            dob: dob || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: current.uid,
          });
      } catch (provisionError) {
        // Without this the canonical admin creation path was the only provisioning
        // surface that left an orphan Firebase Auth identity behind when the claim or
        // Firestore write failed — a login with no tenant record and no seat accounting.
        await adminAuth.deleteUser(userRecord.uid).catch(() => {});
        throw provisionError;
      }
    } finally {
      await releaseStaffSeat(seat);
    }

    // S10: the `hr_employees` mirror document written here has been removed. It had one
    // writer — this block — and ZERO readers anywhere in the codebase, so every staff
    // user creation paid a Firestore write into a collection no screen, report, export
    // or query has ever opened. `users` is the identity model; a second copy of a subset
    // of the same fields could only drift out of date.

    const tokenData = await createPasswordSetupToken({
      uid: userRecord.uid,
      email,
      createdBy: current.uid,
    });

    const emailResult = await sendSetPasswordEmail({ email, link: tokenData.link });

    // 9) Log admin activity
    await adminDb.collection('admin_activity').add({
      action: 'create_user',
      performedBy: current.uid,
      performedByRole: currentRole,
      tenantId,
      targetUser: {
        uid: userRecord.uid,
        email,
        role: targetRole,
      },
      timestamp: new Date().toISOString(),
    });

    // SOC2 F-05: account creation is a CC6.2 control event and must reach the audit
    // trail. This previously called logActivity directly, which writes only to
    // tenants/{id}/activity_feed — so the single most audit-critical IAM event on the
    // platform never appeared in `auditLogs`, the collection the compliance reader,
    // the DSAR export and the super-admin viewer all read. logEvent writes the audit
    // record AND still forwards to the activity feed, so the feed is unchanged.
    await logEvent({
      tenantId,
      type: 'user.created',
      title: 'User created',
      description: `${displayName || email} was added to the workspace as ${targetRole}.`,
      entityType: 'user',
      entityId: userRecord.uid,
      actor: {
        uid: current.uid,
        name: current.name || current.fullName || current.email || 'Admin',
      },
      audit: {
        action: 'create',
        resource: 'user',
        changes: [
          { field: 'email', oldValue: null, newValue: email },
          { field: 'role', oldValue: null, newValue: targetRole },
        ],
      },
    });

    // Notify tenant admins of new team member — non-blocking
    getUsersByRoles(['admin'], tenantId)
      .then((admins) => {
        return Promise.all(
          admins.map((admin) =>
            sendEmail({
              to: admin.email || '',
              subject: `👤 New team member added — ${displayName || email}`,
              html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Team Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">👤 New Team Member Added</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A new user has been created in your workspace.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Name</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${displayName || 'Not set'}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Email</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${email}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Role</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${targetRole}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Added by</td><td style="font-weight:600;color:#1E293B;text-align:right;">${current.name || current.email || 'Admin'}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/admin/users" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Team →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
            }).catch(() => {}),
          ),
        );
      })
      .catch((err) => console.error('[USER_CREATE] Failed to notify admins', err));

    // 10) Respond
    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
      // The set-password link is a live credential and is delivered by email only.
      // It is never returned in an HTTP response (S-1).
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (err: any) {
    console.error('Error create user:', err);
    return NextResponse.json(
      {
        error:
          err?.code === 'auth/email-already-exists'
            ? 'This email address is already registered in the system.'
            : err?.message || 'Failed to create user',
      },
      { status: 400 },
    );
  }
}

// Same helper logic as you already had
function canManageRole(targetRole: string) {
  const r = (targetRole || '').toLowerCase();
  // super_admin / admin allowed to manage all roles except restricting logic already implemented where needed
  return [
    'super_admin',
    'admin',
    'sales_manager',
    'production_manager',
    'am_manager',
    'sales',
    'am',
    'hr',
    'finance',
    'production',
  ].includes(r);
}
