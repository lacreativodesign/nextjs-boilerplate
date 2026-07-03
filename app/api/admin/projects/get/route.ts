import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser } from '../../_utils';

export const runtime = 'nodejs';

function canViewProjects(role: string) {
  const r = (role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'sales_manager' || r === 'am';
}

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!canViewProjects(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const snap = await adminDb.collection('projects').doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = snap.data();
    if (data?.tenantId !== me.tenantId && (me.role || '').toLowerCase() !== 'super_admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ id: snap.id, ...data });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
