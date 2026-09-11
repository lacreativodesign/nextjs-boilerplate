import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '../../_utils';
import { deleteTenantObject } from '@/lib/storage/tenant-object';

export const runtime = 'nodejs';

function cleanString(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const fileId = cleanString(body?.id);

    if (!fileId) {
      return NextResponse.json({ ok: false, error: 'File id is required.' }, { status: 400 });
    }

    const fileSnap = await adminDb.collection('files').doc(fileId).get();
    if (!fileSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const data = fileSnap.data() || {};
    const isSuperAdmin = (me.role || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin && String(data.tenantId || '') !== String(me.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    // PR4-D: free the bytes before freeing the quota. This route used to mark the record
    // deleted and stop there, so the object stayed in the bucket — still billed to
    // Bizosto — while the tenant instantly got its quota back. Uploading and deleting in
    // a loop therefore stored without bound on any plan. If the object cannot be removed
    // the record is left alone, so usage keeps counting bytes that still exist.
    const storagePath = String(data.storagePath || '');
    const ownerTenantId = String(data.tenantId || '');
    if (storagePath) {
      const purge = await deleteTenantObject(storagePath, ownerTenantId);
      // Addressable but not removed is a real failure: recovering the quota now would
      // hand back space for bytes Bizosto is still being billed for.
      if (purge.addressable && !purge.removed) {
        return NextResponse.json(
          { ok: false, error: 'Could not remove the stored file. Nothing was deleted.' },
          { status: 502 },
        );
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await adminDb.collection('files').doc(fileId).set(
      {
        isDeleted: true,
        isLatest: false,
        updatedAt: now,
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('files/delete error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to delete file right now.' },
      { status: 500 },
    );
  }
}
