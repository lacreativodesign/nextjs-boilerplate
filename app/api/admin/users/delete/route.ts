import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole, isSuperAdmin } from '../_utils';
import { logEvent } from '@/lib/audit';
import { validateRequest } from '@/lib/validations/validate';
import { deleteUserSchema } from '@/lib/validations/user-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || (!isAdminRole(current.role) && current.role !== 'super_admin')) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // SOC2 F-06: `uid` was destructured from an unvalidated body. The truthiness
    // check that followed accepted any non-empty value, including an object or an
    // array, which would then be passed to adminAuth.deleteUser and a Firestore
    // document path.
    const { uid } = validateRequest(deleteUserSchema, await req.json().catch(() => ({})));

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return new NextResponse('User not found', { status: 404 });
    }

    const data = userDoc.data();
    const superAdminBypass = (current.role || '').toLowerCase() === 'super_admin';
    if (!superAdminBypass && String(data?.tenantId || '') !== String(current.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    // Prevent Admin from deleting Admin / Super Admin
    if (!isSuperAdmin(current.role)) {
      if (data?.role === 'admin' || data?.role === 'super_admin') {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    // Delete FIREBASE auth account
    await adminAuth.deleteUser(uid);

    // Delete Firestore profile
    await adminDb.collection('users').doc(uid).delete();

    // SOC2 F-05: account deletion is a CC6.2 control event. This previously called
    // logActivity directly, which writes only to tenants/{id}/activity_feed, so the
    // permanent removal of an identity left no entry in `auditLogs`. logEvent writes
    // the audit record AND still forwards to the activity feed.
    await logEvent({
      tenantId: String(data?.tenantId || current.tenantId || ''),
      type: 'user.deleted',
      title: 'User deleted',
      description: `${String(data?.name || data?.email || uid)} was removed from the workspace.`,
      entityType: 'user',
      entityId: uid,
      actor: {
        uid: current.uid,
        name: String(current.name || current.fullName || current.email || 'Admin'),
      },
      audit: {
        action: 'delete',
        resource: 'user',
        changes: [
          { field: 'email', oldValue: String(data?.email || ''), newValue: null },
          { field: 'role', oldValue: String(data?.role || ''), newValue: null },
        ],
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Error delete user:', e);
    return new NextResponse('Server error', { status: 500 });
  }
}
