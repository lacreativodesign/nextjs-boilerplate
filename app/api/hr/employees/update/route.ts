import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, normalizeRole } from '../../../admin/_utils';
import { createHrEvent, isAdminLike, isHrRole } from '../../_utils';
import { logEvent } from '@/lib/audit';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { ERP_ROLES } from '@/lib/erpAccess';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';
import { syncUserClaims } from '@/lib/auth/sync-user-claims';
import { syncFirebaseUserAccessState } from '@/lib/auth/user-access-state';

export const runtime = 'nodejs';

const HR_EDITABLE_STATUSES = new Set(['active', 'inactive', 'disabled', 'terminated']);

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

    const requestedRole = normalizeRole(body?.role || existingRole || '');
    if (!(ERP_ROLES as readonly string[]).includes(requestedRole)) {
      return NextResponse.json({ ok: false, error: 'Invalid role.' }, { status: 400 });
    }

    if (requesterRole !== 'super_admin' && requestedRole === 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Cannot assign super admin role.' },
        { status: 403 },
      );
    }

    const targetTenantId = String(existing?.tenantId || current.tenantId || '').trim();

    if (requestedRole && requestedRole !== existingRole) {
      try {
        assertPermission(requesterRole, Permission.ManageRoles);
      } catch {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      if (requestedRole !== 'super_admin') {
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

        if (existingRole === 'client' && requestedRole !== 'client') {
          const seatCheck = await checkUserLimit(targetTenantId, requestedRole);
          if (!seatCheck.ok) {
            return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
          }
        }
      }
    }

    const email = String(existing?.email || '').trim();
    const status = normalizeString(body?.status, existingStatus).toLowerCase();
    if (!HR_EDITABLE_STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: 'Invalid user status.' }, { status: 400 });
    }

    if (status === 'terminated' && existingStatus !== 'terminated') {
      return NextResponse.json(
        { ok: false, error: 'Use the employee termination action to terminate access.' },
        { status: 400 },
      );
    }

    if (existing?.isDeleted === true && status === 'active') {
      return NextResponse.json(
        { ok: false, error: 'Use the reactivation action to restore a terminated user.' },
        { status: 409 },
      );
    }

    const nextIsActive = status === 'active' && existing?.isDeleted !== true;

    const updateData = {
      name: normalizeString(body?.name, existing?.name),
      email,
      phone: normalizeString(body?.phone, existing?.phone),
      cnic: normalizeString(body?.cnic, existing?.cnic),
      dob: normalizeDate(body?.dob, existing?.dob),
      status,
      isActive: nextIsActive,
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

    const accessStatusChanged = status !== existingStatus;
    if (accessStatusChanged && status !== 'active') {
      await syncFirebaseUserAccessState({
        uid,
        status,
        isActive: false,
        isDeleted: existing?.isDeleted,
      });
    }

    await adminDb.collection('users').doc(uid).update(updateData);

    if (accessStatusChanged && status === 'active' && existing?.isDeleted !== true) {
      await syncFirebaseUserAccessState({
        uid,
        status,
        isActive: true,
        isDeleted: false,
      });
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
