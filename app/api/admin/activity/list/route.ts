import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole } from '../../_utils';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const snap = await adminDb
      .collection('activity')
      .where('tenantId', '==', current.tenantId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const logs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json(logs);
  } catch (e) {
    console.error('ACTIVITY_LIST_ERROR:', e);
    return new NextResponse('Server error', { status: 500 });
  }
}
