import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '../../_utils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const snap = await adminDb.collection('leads').doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = snap.data();
    if (data?.tenantId !== auth.user.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ id: snap.id, ...data });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
