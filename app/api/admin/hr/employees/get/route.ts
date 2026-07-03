import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { monitoringLogger } from '@/lib/monitoring/logger';
import { requireHrAccess, toIso } from '../../_utils';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(req.url);
    const uid = String(searchParams.get('id') || searchParams.get('uid') || '').trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Missing user id' }, { status: 400 });
    }

    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const data = snap.data() || {};
    const isSuperAdmin = String(access.user.role || '').toLowerCase() === 'super_admin';
    if (
      !isSuperAdmin &&
      String((data as any).tenantId || '').trim() !== String(access.user.tenantId || '').trim()
    ) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        uid: snap.id,
        ...data,
        createdAt: toIso(data?.createdAt),
        updatedAt: toIso(data?.updatedAt),
      },
    });
  } catch (err) {
    monitoringLogger
      .error('HR employees get error', 'hr', {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
