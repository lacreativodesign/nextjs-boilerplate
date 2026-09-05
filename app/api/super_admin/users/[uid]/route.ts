import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import { ERP_ROLES } from '@/lib/erpAccess';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';
import { syncUserClaims } from '@/lib/auth/sync-user-claims';
import { syncFirebaseUserAccessState } from '@/lib/auth/user-access-state';

export async function PATCH(req: NextRequest, { params }: { params: { uid: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const uid = params.uid;
    const body = await req.json().catch(() => ({}));

    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    const existingRole = String(existing.role || '')
      .trim()
      .toLowerCase();
    const existingTenantId = String(existing.tenantId || '').trim();
    const existingStatus = String(existing.status || 'active')
      .trim()
      .toLowerCase();

    const updates: Record<string, unknown> = {};

    if (body?.displayName !== undefined) {
      const displayName = String(body.displayName || '').trim();
      if (!displayName) {
        return NextResponse.json({ ok: false, error: 'Display name is required' }, { status: 400 });
      }
      updates.displayName = displayName;
      updates.name = displayName;
    }

    if (body?.tenantId !== undefined) {
      const requestedTenantId = String(body.tenantId || '').trim();
      if (requestedTenantId !== existingTenantId) {
        // Tenant reassignment is not a field edit. The user profile, team membership,
        // reporting hierarchy, invitations and tenant-scoped joins all carry tenant
        // ownership too. Updating only users/{uid}.tenantId would strand those records
        // in the old tenant while the Auth claim points at the new one.
        return NextResponse.json(
          {
            ok: false,
            error:
              'Tenant reassignment is not supported by this endpoint. Re-provision the user in the destination workspace instead.',
          },
          { status: 409 },
        );
      }
    }

    const nextRole =
      body?.role !== undefined
        ? String(body.role || '')
            .trim()
            .toLowerCase()
        : existingRole;
    if (!(ERP_ROLES as readonly string[]).includes(nextRole)) {
      return NextResponse.json({ ok: false, error: 'Invalid role' }, { status: 400 });
    }

    const roleChanged = nextRole !== existingRole;
    if (roleChanged && nextRole !== 'super_admin') {
      const tenantSnap = await adminDb.collection('tenants').doc(existingTenantId).get();
      if (!tenantSnap.exists) {
        return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
      }

      const rolesEnabled = resolveTenantRoles(tenantSnap.data()?.rolesEnabled);
      if (!isRoleEnabled(rolesEnabled, nextRole)) {
        return NextResponse.json(
          { ok: false, error: 'This role is not enabled for the workspace.' },
          { status: 400 },
        );
      }

      if (existingRole === 'client' && nextRole !== 'client') {
        const seatCheck = await checkUserLimit(existingTenantId, nextRole);
        if (!seatCheck.ok) {
          return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
        }
      }
    }
    if (body?.role !== undefined) updates.role = nextRole;

    const nextStatus =
      body?.status !== undefined
        ? String(body.status || '')
            .trim()
            .toLowerCase()
        : existingStatus;
    if (nextStatus !== 'active' && nextStatus !== 'disabled') {
      return NextResponse.json({ ok: false, error: 'Invalid user status' }, { status: 400 });
    }
    if (existing.isDeleted === true && nextStatus === 'active') {
      return NextResponse.json(
        { ok: false, error: 'A deleted user must be restored through the reactivation flow.' },
        { status: 409 },
      );
    }
    if (body?.status !== undefined) {
      updates.status = nextStatus;
      updates.isActive = nextStatus === 'active';
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: false, error: 'No updates provided' }, { status: 400 });
    }

    const statusChanged = nextStatus !== existingStatus;
    if (statusChanged && nextStatus === 'disabled') {
      await syncFirebaseUserAccessState({
        uid,
        status: 'disabled',
        isActive: false,
        isDeleted: existing.isDeleted,
      });
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await adminDb.collection('users').doc(uid).set(updates, { merge: true });

    if (updates.displayName) {
      await adminAuth.updateUser(uid, { displayName: updates.displayName as string });
    }

    if (roleChanged) {
      await syncUserClaims({
        uid,
        role: nextRole,
        tenantId: existingTenantId,
        endSessions: true,
      });
    }

    if (statusChanged && nextStatus === 'active' && existing.isDeleted !== true) {
      await syncFirebaseUserAccessState({
        uid,
        status: 'active',
        isActive: true,
        isDeleted: false,
      });
    }

    await writeAuditLog({
      tenantId: existingTenantId || null,
      actorUserId: user.uid,
      actionType: roleChanged ? 'user_role_updated' : 'user_updated',
      entityType: 'user',
      entityId: uid,
      metadata: {
        ...updates,
        previousRole: existingRole,
        previousStatus: existingStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
