import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { monitoringLogger } from '@/lib/monitoring/logger';
import { requireHrAccess, toIso } from '../../_utils';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const snap = await adminDb
      .collection('employeeDocuments')
      .where('tenantId', '==', access.user.tenantId)
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    const documents = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: toIso(data?.createdAt),
        updatedAt: toIso(data?.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, documents });
  } catch (err) {
    monitoringLogger
      .error('HR documents list error', 'hr', {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
