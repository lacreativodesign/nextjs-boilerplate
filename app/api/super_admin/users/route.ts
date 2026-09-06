import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import { platformCreateUserSchema } from '@/lib/validations/user';
import { validateRequest } from '@/lib/validations/validate';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';
import { planLimitResponseBody } from '@/lib/billing/user-limit';
import {
  releaseStaffSeat,
  reserveStaffSeat,
  type StaffSeatReservation,
} from '@/lib/billing/seat-reservation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const snap = await adminDb.collection('users').orderBy('createdAt', 'desc').limit(500).get();
    const users = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        displayName: data.displayName || data.name || '',
        email: data.email || '',
        role: data.role || '',
        tenantId: data.tenantId || '',
        status: data.status || 'active',
        createdAt: data.createdAt || null,
      };
    });
    return NextResponse.json({ ok: true, users });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const status = body?.status === undefined ? 'active' : String(body.status).toLowerCase();

    if (status !== 'active' && status !== 'disabled') {
      return NextResponse.json({ ok: false, error: 'Invalid user status' }, { status: 400 });
    }

    const validated = validateRequest(platformCreateUserSchema, {
      email: body?.email,
      displayName: body?.displayName,
      role: body?.role,
      tenantId: body?.tenantId,
    });
    const { email, displayName, role, tenantId } = validated;

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
    }

    // A platform Super Admin is not a tenant staff seat, so it neither needs the tenant
    // role allow-list nor consumes plan capacity. Every other role does both.
    let seat: StaffSeatReservation | null = null;
    if (role !== 'super_admin') {
      const rolesEnabled = resolveTenantRoles(tenantSnap.data()?.rolesEnabled);
      if (!isRoleEnabled(rolesEnabled, role)) {
        return NextResponse.json(
          { ok: false, error: 'This role is not enabled for the workspace.' },
          { status: 400 },
        );
      }

      // Atomic reservation: platform authority does not exempt a tenant from its plan.
      seat = await reserveStaffSeat(tenantId, role, 'super_admin_create');
      if (!seat.ok) {
        return NextResponse.json(planLimitResponseBody(seat), { status: 403 });
      }
    }

    let authUser;
    try {
      authUser = await adminAuth.createUser({
        email,
        displayName,
        disabled: status === 'disabled',
      });

      try {
        // Claims are installed before the Firestore identity is published, so a newly
        // created account is never visible with a tenant document but missing its RBAC
        // enforcement-plane claims.
        await adminAuth.setCustomUserClaims(authUser.uid, { role, tenantId });

        const now = admin.firestore.FieldValue.serverTimestamp();
        await adminDb
          .collection('users')
          .doc(authUser.uid)
          .set(
            {
              uid: authUser.uid,
              email,
              displayName,
              name: displayName,
              role,
              tenantId,
              status,
              isActive: status === 'active',
              createdAt: now,
              updatedAt: now,
              createdBy: user.uid,
            },
            { merge: true },
          );
      } catch (provisionError) {
        await adminAuth.deleteUser(authUser.uid).catch(() => {});
        throw provisionError;
      }
    } finally {
      await releaseStaffSeat(seat);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: 'user_created',
      entityType: 'user',
      entityId: authUser.uid,
      metadata: { email, role, status },
    });

    return NextResponse.json({ ok: true, uid: authUser.uid });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
