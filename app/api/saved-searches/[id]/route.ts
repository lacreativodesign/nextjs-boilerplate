import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';

function isAdminOrOwner(role?: string | null) {
  const normalized = normalizeRole(role || '');
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'owner';
}

// DELETE - Delete saved search
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await adminDb.collection('saved_searches').doc(params.id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const search = doc.data();
    if (!search || search.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (search.userId !== session.uid && !isAdminOrOwner(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await adminDb.collection('saved_searches').doc(params.id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting saved search:', error);
    return NextResponse.json({ error: 'Failed to delete saved search' }, { status: 500 });
  }
}

// PATCH - Update usage count
export async function PATCH(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await adminDb.collection('saved_searches').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const search = doc.data();
    if (!search || search.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await adminDb
      .collection('saved_searches')
      .doc(params.id)
      .update({
        usageCount: admin.firestore.FieldValue.increment(1),
        lastUsedAt: Timestamp.now(),
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating saved search:', error);
    return NextResponse.json({ error: 'Failed to update saved search' }, { status: 500 });
  }
}
