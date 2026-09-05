import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { UserService } from '@/lib/users/user-service';
import { getCurrentUser, isAdminRole } from '@/app/api/admin/_utils';
import { logEvent } from '@/lib/audit';
import { assertPermission, Permission } from '@/app/lib/permissions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  title: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  phoneNumber: z.string().max(40).optional().nullable(),
  timezone: z.string().max(80).optional().nullable(),
  language: z.string().max(80).optional().nullable(),
  address: z
    .object({
      street: z.string().max(200).optional().nullable(),
      city: z.string().max(120).optional().nullable(),
      state: z.string().max(120).optional().nullable(),
      zipCode: z.string().max(40).optional().nullable(),
      country: z.string().max(120).optional().nullable(),
    })
    .optional(),
  preferences: z
    .object({
      emailNotifications: z.boolean(),
      desktopNotifications: z.boolean(),
      weeklyDigest: z.boolean(),
      theme: z.enum(['light', 'dark', 'auto']).optional(),
    })
    .optional(),
  skills: z.array(z.string().min(1)).optional(),
  certifications: z.array(z.string().min(1)).optional(),
  linkedIn: z.string().url().optional().nullable(),
  github: z.string().url().optional().nullable(),
});

function canManageUsers(role: string): boolean {
  try {
    assertPermission(role, Permission.ManageUsers);
    return true;
  } catch {
    return false;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    if (params.id !== me.uid && !canManageUsers(me.role)) {
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

    const updates = {
      ...data,
      'onboardingSteps.profileSetup': true,
    } as Record<string, any>;

    await UserService.updateUserProfile(params.id, updates);

    if (data.name) {
      await adminDb
        .collection('users')
        .doc(params.id)
        .update({ name: data.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    await UserService.logActivity({
      tenantId: me.tenantId,
      userId: me.uid,
      type: 'profile_update',
      action: 'updated user profile',
      resourceType: 'user_profile',
      resourceId: params.id,
      resourceName: data.name || userData.name || userData.email,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error?.message || 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Profile editing and access revocation are different privileges. HR may edit user
    // records through ManageUsers, but only Admin/Super Admin may disable login access.
    if (!isAdminRole(String(me.role || '').toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (params.id === me.uid) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account from this endpoint.' },
        { status: 409 },
      );
    }

    const userDoc = await adminDb.collection('users').doc(params.id).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data() || {};
    if (userData.tenantId !== me.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const requesterRole = String(me.role || '').toLowerCase();
    const targetRole = String(userData.role || '').toLowerCase();
    if (
      requesterRole !== 'super_admin' &&
      (targetRole === 'admin' || targetRole === 'super_admin')
    ) {
      return NextResponse.json(
        { error: 'Only a Super Admin can deactivate an Admin or Super Admin account.' },
        { status: 403 },
      );
    }

    await UserService.deactivateUser(params.id);

    await UserService.logActivity({
      tenantId: me.tenantId,
      userId: me.uid,
      type: 'settings_change',
      action: 'deactivated user',
      resourceType: 'user',
      resourceId: params.id,
      resourceName: userData.name || userData.email,
    });

    // SOC2 F-05: UserService.logActivity writes to `user_activity`, which is a
    // per-user timeline, not the audit trail. Revoking someone's access is a CC6.2
    // event and has to reach `auditLogs` as well.
    await logEvent({
      tenantId: me.tenantId,
      type: 'user.deactivated',
      title: 'User deactivated',
      description: `${userData.name || userData.email || params.id} was deactivated.`,
      entityType: 'user',
      entityId: params.id,
      actor: { uid: me.uid, name: me.name || me.email || '' },
      audit: {
        action: 'update',
        resource: 'user',
        changes: [{ field: 'status', oldValue: 'active', newValue: 'inactive' }],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deactivating user:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to deactivate user' },
      { status: 500 },
    );
  }
}
