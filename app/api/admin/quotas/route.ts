import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { loadRateLimitConfigFromFirestore } from '@/lib/rate-limit/config';
import { getCurrentUser, isSuperAdmin } from '../_utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current || !isSuperAdmin(current.role)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.tenantId || !body?.dailyLimit || !body?.monthlyLimit) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  await adminDb
    .collection('tenant_quotas')
    .doc(String(body.tenantId))
    .set(
      {
        plan: String(body.plan || 'custom'),
        dailyLimit: Number(body.dailyLimit),
        monthlyLimit: Number(body.monthlyLimit),
        updatedAt: new Date().toISOString(),
        updatedBy: current.uid,
      },
      { merge: true },
    );

  await loadRateLimitConfigFromFirestore();

  return NextResponse.json({ ok: true });
}
