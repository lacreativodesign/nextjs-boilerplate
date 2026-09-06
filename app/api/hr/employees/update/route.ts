import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, normalizeRole } from '../../../admin/_utils';
import { createHrEvent, isAdminLike, isHrRole } from '../../_utils';
import { logEvent } from '@/lib/audit';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { ERP_ROLES } from '@/lib/erpAccess';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { planLimitResponseBody } from '@/lib/billing/user-limit';
import {
  releaseStaffSeat,
  reserveStaffSeat,
  type StaffSeatReservation,
} from '@/lib/billing/seat-reservation';
import { syncUserClaims } from '@/lib/auth/sync-user-claims';

export const runtime = 'nodejs';

function normalizeString(incoming: any, existingValue: any = '') {
  if (incoming === undefined || incoming === null || incoming === '')
    return String(existingValue || '');
  return String(incoming || '').trim();
}

function normalizeNumber(incoming: any, existingValue: any = null) {
  if (incoming === undefined || incoming === '') return existingValue ?? null;
  if (incoming === null) return null;
  const num = Number(incoming);
  return Number.isFinite(num) ? num : (existingValue ?? null);
}

function normalizeDate(incoming: any, existingValue: any = null) {
  if (incoming === undefined || incoming === '') return existingValue ?? null;
  if (incoming === null) return null;
  return incoming;
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const requesterRole = normalizeRole(current.role);
    if (!isAdminLike(requesterRole) && !isHrRole(requesterRole)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      assertPermission(requesterRole, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || '').trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Missing user id' }, { status: 400 });
    }

    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    const existingRole = normalizeRole(existing?.role || '');
    const existingStatus = String(existing?.status || 'active')
      .trim()
      .toLowerCase();
    if (requesterRole !== 'super_admin' && existing?.tenantId !== current.tenantId) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    if (requesterRole !== 'super_admin' && existingRole === 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Cannot modify super admin accounts.' },
        { status: 403 },
      );
    }

    // HR profile maintenance must never become a second account-disable/reactivation
    // surface. Access state is an IAM operation and must go through the dedicated
    // deactivate, reactivate or termination flows, where Firebase Auth and seat checks
    // are enforced consistently.
    if (body?.status !== undefined) {
      const requestedStatus = normalizeString(body.status, existingStatus).toLowerCase();
      if (requestedStatus !== existingStatus) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Account status cannot be changed from the employee profile. Use the dedicated deactivate, reactivate, or termination action.',
          },
          { status: 409 },
        );
      }
    }

    // `super_admin` is a platform identity, not a tenant staff role. This is a
    // tenant-scoped HR profile surface, so a submitted `super_admin` is refused for
    // every actor — a platform Super Admin included, whose own promotion surface is
    // `/api/super_admin/users/[uid]`. Omitting `role` still falls back to the stored
    // value, so editing an existing platform identity's profile keeps working.
    if (normalizeRole(body?.role || '') === 'super_admin') {
      return NextResponse.json(
        {
          ok: false,
          error: 'super_admin must be managed through the platform administration surface',
        },
        { status: 403 },
      );
    }

    const requestedRole = normalizeRole(body?.role || existingRole || '');
    if (!(ERP_ROLES as readonly string[]).includes(requestedRole)) {
      return NextResponse.json({ ok: false, error: 'Invalid role.' }, { status: 400 });
    }

    const targetTenantId = String(existing?.tenantId || current.tenantId || '').trim();

    // Moving a client-portal identity into a staff role is the one profile edit that
    // consumes plan capacity. Detected here, reserved immediately before the write.
    const convertsClientToStaff =
      Boolean(requestedRole) && existingRole === 'client' && requestedRole !== 'client';

    if (requestedRole && requestedRole !== existingRole) {
      try {
        assertPermission(requesterRole, Permission.ManageRoles);
      } catch {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      // A role change on this surface is always a tenant role now, so the workspace
      // allow-list applies unconditionally.
      const tenantSnap = await adminDb.collection('tenants').doc(targetTenantId).get();
      if (!tenantSnap.exists) {
        return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
      }
      const rolesEnabled = resolveTenantRoles(tenantSnap.data()?.rolesEnabled);
      if (!isRoleEnabled(rolesEnabled, requestedRole)) {
        return NextResponse.json(
          { ok: false, error: 'This role is not enabled for the workspace.' },
          { status: 400 },
        );
      }
    }

    const email = String(existing?.email || '').trim();
    const updateData = {
      name: normalizeString(body?.name, existing?.name),
      email,
      phone: normalizeString(body?.phone, existing?.phone),
      cnic: normalizeString(body?.cnic, existing?.cnic),
      dob: normalizeDate(body?.dob, existing?.dob),
      role: requestedRole || existingRole,
      department: normalizeString(body?.department, existing?.department),
      designation: normalizeString(body?.designation, existing?.designation),
      joiningDate: normalizeDate(body?.joiningDate, existing?.joiningDate),
      salary: normalizeNumber(body?.salary, existing?.salary),
      monthlyTarget: normalizeNumber(body?.monthlyTarget, existing?.monthlyTarget),
      commission: normalizeNumber(body?.commission, existing?.commission),
      updatedAt: new Date().toISOString(),
    };

    if (!updateData.name || !updateData.role || !updateData.department || !updateData.email) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Reserved immediately before the write, so a request that fails validation never
    // parks capacity, and two concurrent conversions cannot both take the last seat.
    let seat: StaffSeatReservation | null = null;
    if (convertsClientToStaff) {
      seat = await reserveStaffSeat(targetTenantId, requestedRole, 'role_conversion');
      if (!seat.ok) {
        return NextResponse.json(planLimitResponseBody(seat), { status: 403 });
      }
    }

    try {
      await adminDb.collection('users').doc(uid).update(updateData);
    } finally {
      await releaseStaffSeat(seat);
    }

    if (requestedRole && requestedRole !== existingRole) {
      await syncUserClaims({
        uid,
        role: requestedRole,
        tenantId: targetTenantId,
        endSessions: true,
      });

      await createHrEvent({
        type: 'hr.role_changed',
        title: 'Role updated',
        description: `${updateData.name} role changed to ${requestedRole}.`,
        entityType: 'user',
        entityId: uid,
        createdByUid: current.uid,
        createdByName: current.name || current.email || 'Admin',
        metadata: { from: existingRole, to: requestedRole },
      });

      try {
        await logEvent({
          tenantId: targetTenantId,
          type: 'user.role_changed',
          title: 'Role updated',
          description: `${updateData.name} role changed to ${requestedRole}.`,
          entityType: 'user',
          entityId: uid,
          actor: { uid: current.uid, name: current.name || current.email || 'Admin' },
          metadata: { from: existingRole, to: requestedRole },
          audit: {
            action: 'role_changed',
            resource: 'user',
            changes: [{ field: 'role', oldValue: existingRole, newValue: requestedRole }],
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }
    }

    await createHrEvent({
      type: 'hr.user_updated',
      title: 'User updated',
      description: `${updateData.name} profile updated.`,
      entityType: 'user',
      entityId: uid,
      createdByUid: current.uid,
      createdByName: current.name || current.email || 'Admin',
    });

    return NextResponse.json({
      ok: true,
      user: {
        uid,
        ...existing,
        ...updateData,
        updatedAt: updateData.updatedAt || new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('HR employees update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
