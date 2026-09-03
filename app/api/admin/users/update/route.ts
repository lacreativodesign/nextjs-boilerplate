import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { getCurrentUser } from '../_utils';
import { logEvent } from '@/lib/audit';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { eligibleManagerRolesFor } from '@/lib/hierarchy';
import { validateRequest } from '@/lib/validations/validate';
import { adminUpdateUserSchema } from '@/lib/validations/user-admin';

export const runtime = 'nodejs';

function isAdminLike(role: string) {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin';
}

function canEditUsers(role: string) {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'hr';
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const requesterRole = String(current.role || '').toLowerCase();
    if (!canEditUsers(requesterRole)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      assertPermission(requesterRole, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // SOC2 F-06: `role` was the gap that mattered. The route lowercased whatever
    // string arrived and wrote it to users/{uid}.role with no check against the
    // canonical list. The surrounding guards are sound — role changes require
    // ManageRoles, only a super_admin may touch or grant super_admin, the tenant is
    // checked — but none of them establishes that the value is a role the system
    // recognises. getCurrentUserOrThrow fails closed only on an EMPTY role, so a user
    // carrying `role: 'wizard'` would still authenticate, match no permission check,
    // and land in a state no screen can recover.
    const body = validateRequest(adminUpdateUserSchema, await req.json().catch(() => ({})));

    const uid = body.uid;
    const name = body.name;
    const requestedEmail = String(body.email || '').trim();
    const requestedRole = String(body.role || '').trim();
    const requestedDepartment = String(body.department || '').trim();

    // Pull existing doc to enforce email restriction and preserve untouched fields
    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists)
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });

    const existing = snap.data() || {};
    const isSuperAdmin = requesterRole === 'super_admin';
    if (!isSuperAdmin && String(existing.tenantId || '') !== String(current.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const existingEmail = String(existing?.email || '').trim();
    const existingRole = String(existing?.role || '')
      .trim()
      .toLowerCase();
    const existingDepartment = String(existing?.department || '').trim();

    const email = requestedEmail || existingEmail;
    const role = (requestedRole || existingRole || '').toLowerCase();
    const department = requestedDepartment || existingDepartment;

    if (requestedRole && role !== existingRole) {
      try {
        assertPermission(requesterRole, Permission.ManageRoles);
      } catch {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    if (!email || !role || !department) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    // ✅ Only admin/super_admin can change email
    const wantsEmailChange = existingEmail && existingEmail.toLowerCase() !== email.toLowerCase();
    if (wantsEmailChange && !isAdminLike(requesterRole)) {
      return NextResponse.json(
        { ok: false, error: 'Only Admin / Super Admin can change email.' },
        { status: 403 },
      );
    }

    // ✅ Admin cannot edit super_admin or assign super_admin role
    const targetIsSuper = existingRole === 'super_admin';
    const assignsSuper = role === 'super_admin';
    const isSuperAdminRequester = requesterRole === 'super_admin';

    if (!isSuperAdminRequester && (targetIsSuper || assignsSuper)) {
      return NextResponse.json(
        { ok: false, error: 'Admins/HR cannot modify or assign super_admin role.' },
        { status: 403 },
      );
    }

    // if admin changes email -> update Auth email too
    if (wantsEmailChange && isAdminLike(requesterRole)) {
      await adminAuth.updateUser(uid, { email });
    }

    const normalizeString = (incoming: any, existingValue: any = '') =>
      incoming !== undefined ? String(incoming || '').trim() : String(existingValue || '').trim();

    const normalizeDate = (incoming: any, existingValue: any = null) =>
      incoming !== undefined ? (incoming ?? null) : (existingValue ?? null);

    const normalizeNumber = (incoming: any, existingValue: any = null) => {
      if (incoming === undefined) return existingValue ?? null;
      if (incoming === null || incoming === '') return null;
      const num = Number(incoming);
      return Number.isFinite(num) ? num : (existingValue ?? null);
    };

    // managerId: validate if a new value is being set, otherwise preserve existing
    let managerId: string = String(existing.managerId || '');
    let managerExplicitlySet = false;
    if (body?.managerId !== undefined && String(body.managerId || '').trim() !== '') {
      const mid = String(body.managerId).trim();
      const managerSnap = await adminDb.collection('users').doc(mid).get();
      if (!managerSnap.exists) {
        return NextResponse.json(
          { ok: false, error: 'Invalid manager selection.' },
          { status: 400 },
        );
      }
      const managerData = managerSnap.data() || {};
      const tenantMatch = isSuperAdminRequester
        ? true
        : String(managerData.tenantId || '') === String(current.tenantId || '');
      if (!tenantMatch) {
        return NextResponse.json(
          { ok: false, error: 'Invalid manager selection.' },
          { status: 400 },
        );
      }
      const eligibleRoles = eligibleManagerRolesFor(role);
      if (!eligibleRoles.includes(String(managerData.role || ''))) {
        return NextResponse.json(
          { ok: false, error: 'Invalid manager selection.' },
          { status: 400 },
        );
      }
      managerId = mid;
      managerExplicitlySet = true;
    }

    // Re-validate preserved managerId against the NEW role.
    // Handles role promotions (e.g. sales→sales_manager) where the old manager is no longer
    // in the eligible list. Skipped when the admin explicitly supplied a validated managerId above.
    if (!managerExplicitlySet) {
      const eligibleForNewRole = eligibleManagerRolesFor(role);
      if (eligibleForNewRole.length === 0) {
        // User is now admin/super_admin — top of hierarchy, no manager
        managerId = '';
      } else if (managerId) {
        const managerCheckSnap = await adminDb.collection('users').doc(managerId).get();
        const managerRole = managerCheckSnap.exists
          ? String((managerCheckSnap.data() || {}).role || '')
          : '';
        if (!managerCheckSnap.exists || !eligibleForNewRole.includes(managerRole)) {
          // Old manager is no longer valid for new role — reset to tenant admin
          const targetTenantId = String(existing.tenantId || '');
          const adminSnap = await adminDb
            .collection('users')
            .where('tenantId', '==', targetTenantId)
            .where('role', '==', 'admin')
            .limit(1)
            .get();
          managerId = adminSnap.empty ? '' : adminSnap.docs[0].id;
        }
      }
    }

    const updateData = {
      // core
      name,
      email,
      phone: normalizeString(body?.phone, existing?.phone),
      cnic: normalizeString(body?.cnic, existing?.cnic),
      dob: normalizeDate(body?.dob, existing?.dob),

      status: normalizeString(body?.status || existing?.status || 'active').toLowerCase(),
      role,
      managerId,
      department,

      // ✅ correct key
      designation: normalizeString(body?.designation, existing?.designation),
      joiningDate: normalizeDate(body?.joiningDate, existing?.joiningDate),

      // numbers (nullable)
      salary: normalizeNumber(body?.salary, existing?.salary),
      monthlyTarget: normalizeNumber(body?.monthlyTarget, existing?.monthlyTarget),
      commission: normalizeNumber(body?.commission, existing?.commission),

      updatedAt: new Date().toISOString(),
    };

    const changes = Object.entries(updateData)
      .filter(([field]) => field !== 'updatedAt')
      .filter(([field, value]) => value !== (existing as Record<string, unknown>)[field])
      .map(([field, value]) => ({
        field,
        oldValue: (existing as Record<string, unknown>)[field],
        newValue: value,
      }));

    await adminDb.collection('users').doc(uid).update(updateData);

    if (changes.length) {
      try {
        await logEvent({
          type: 'user.updated',
          title: 'User updated',
          description: `${name} profile updated.`,
          entityType: 'user',
          entityId: uid,
          actor: { uid: current.uid, name: current.name || current.email || '' },
          audit: {
            action: 'update',
            resource: 'user',
            changes,
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }
    }

    if (requestedRole && role !== existingRole) {
      try {
        await logEvent({
          type: 'user.role_changed',
          title: 'Role updated',
          description: `${name} role changed to ${role}.`,
          entityType: 'user',
          entityId: uid,
          actor: { uid: current.uid, name: current.name || current.email || '' },
          metadata: { from: existingRole, to: role },
          audit: {
            action: 'role_changed',
            resource: 'user',
            changes: [
              {
                field: 'role',
                oldValue: existingRole,
                newValue: role,
              },
            ],
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('UPDATE USER ERROR:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
