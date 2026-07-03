import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const snap = await adminDb.collection('users').doc(current.uid).get();
  const data = snap.data() || {};
  const providers = (data.sso as any)?.providers || {};

  return NextResponse.json({ ok: true, providers });
}
