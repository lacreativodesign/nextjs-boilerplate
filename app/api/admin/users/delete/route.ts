import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole, isSuperAdmin } from '../_utils';
import { logActivity } from '@/lib/activity/tracker';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { uid } = await req.json();
    if (!uid) {
      return new NextResponse('Missing uid', { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return new NextResponse('User not found', { status: 404 });
    }

    const data = userDoc.data();

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

    await logActivity({
      tenantId: String(data?.tenantId || current.tenantId || ''),
      actor: {
        uid: current.uid,
        name: String(current.name || current.fullName || current.email || 'Admin'),
      },
      action: 'deleted',
      entityType: 'user',
      entityId: uid,
      entityName: String(data?.name || data?.email || uid),
      category: 'user',
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Error delete user:', e);
    return new NextResponse('Server error', { status: 500 });
  }
}
