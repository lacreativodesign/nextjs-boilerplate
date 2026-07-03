import { NextResponse } from 'next/server';
import { adminDb as db } from '@/lib/firebaseAdmin';
import { docTenantId } from '@/lib/tenant';
import { getCurrentUser } from '../../_utils';

export const dynamic = 'force-dynamic';

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function canViewClient(role: string) {
  const r = (role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'sales_manager';
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!canViewClient(me.role))
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const snap = await db.collection('clients').doc(id).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    const data = snap.data() || {};
    if (docTenantId(data) !== me.tenantId && me.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    if ((data as any).deletedAt)
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      client: {
        id: snap.id,
        ...data,
        createdAt: toISO((data as any).createdAt),
        updatedAt: toISO((data as any).updatedAt),
        lastActivity: toISO((data as any).lastActivity),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to get client' },
      { status: 500 },
    );
  }
}
