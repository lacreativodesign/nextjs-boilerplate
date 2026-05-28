import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole } from '../../_utils';
import { logActivity } from '@/lib/activity/tracker';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me || !isAdminRole(me.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing project id' }, { status: 400 });
    }

    const ref = adminDb.collection('projects').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    const data = snap.data() || {};
    const isSuperAdmin = (me.role || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin && String(data.tenantId || '') !== String(me.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        isDeleted: true,
        updatedAt: now,
        lastActivityAt: now,
      },
      { merge: true },
    );

    await logActivity({
      tenantId: me.tenantId,
      actor: { uid: me.uid, name: String(me.name || me.fullName || me.displayName || 'Admin') },
      action: 'deleted',
      entityType: 'project',
      entityId: id,
      entityName: String(data.projectName || id),
      category: 'project',
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('projects/delete error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
