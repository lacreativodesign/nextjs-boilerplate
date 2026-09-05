import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { UserService } from '@/lib/users/user-service';
import { getCurrentUser, isAdminRole } from '@/app/api/admin/_utils';
import { logEvent } from '@/lib/audit';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Restoring login access is an IAM action, not a profile edit. HR may maintain
    // employee records through ManageUsers, but only Admin/Super Admin may reactivate.
    const requesterRole = String(me.role || '').toLowerCase();
    if (!isAdminRole(requesterRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userDoc = await adminDb.collection('users').doc(params.id).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data() || {};
    if (userData.tenantId !== me.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetRole = String(userData.role || '').toLowerCase();
    if (requesterRole !== 'super_admin' && targetRole === 'super_admin') {
      return NextResponse.json(
        { error: 'Only a Super Admin can reactivate a Super Admin account.' },
        { status: 403 },
      );
    }

    // Inactive identities do not consume staff seats. Reactivating one does, so enforce
    // the current (or stricter pending-downgrade) ceiling before enabling Auth.
    const seatCheck = await checkUserLimit(String(me.tenantId || ''), targetRole);
    if (!seatCheck.ok) {
      return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
    }

    await UserService.reactivateUser(params.id);

    await UserService.logActivity({
      tenantId: me.tenantId,
      userId: me.uid,
      type: 'settings_change',
      action: 'reactivated user',
      resourceType: 'user',
      resourceId: params.id,
      resourceName: userData.name || userData.email,
    });

    // SOC2 F-05: restoring access is the counterpart to deactivation and belongs in
    // the same trail. Without it, `auditLogs` would show access being revoked and
    // never granted back.
    await logEvent({
      tenantId: me.tenantId,
      type: 'user.reactivated',
      title: 'User reactivated',
      description: `${userData.name || userData.email || params.id} was reactivated.`,
      entityType: 'user',
      entityId: params.id,
      actor: { uid: me.uid, name: me.name || me.email || '' },
      audit: {
        action: 'update',
        resource: 'user',
        changes: [{ field: 'status', oldValue: 'inactive', newValue: 'active' }],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error reactivating user:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to reactivate user' },
      { status: 500 },
    );
  }
}
