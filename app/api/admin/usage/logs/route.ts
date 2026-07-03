import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '../../_utils';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const current = await getCurrentUser();
  if (!current || !isAdminOrSuper(current.role)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25)));

  try {
    const snap = await adminDb
      .collection('api_usage_logs')
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .get();

    const logs = (
      snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Array<
        { id: string } & Record<string, any>
      >
    ).filter((row) => current.role === 'super_admin' || row.tenantId === current.tenantId);

    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    console.error('usage logs error', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
