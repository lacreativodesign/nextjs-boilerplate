import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId } from '@/lib/tenant';
import { createSalesEvent, parseString, requireAdmin, serverTimestamp } from '../../_utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, '');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing follow-up id.' }, { status: 400 });
    }

    const docRef = adminDb.collection('followUps').doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: 'Follow-up not found.' }, { status: 404 });
    }
    const existing = snapshot.data() || {};
    if (docTenantId(existing) !== auth.user.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    await docRef.set(
      {
        isDeleted: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await createSalesEvent({
      type: 'follow_up_deleted',
      title: 'Follow-up deleted',
      description: `Follow-up ${id} deleted`,
      entityType: 'follow_up',
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || '',
      tenantId: auth.user.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('sales follow-ups delete error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to delete follow-up.' }, { status: 500 });
  }
}
