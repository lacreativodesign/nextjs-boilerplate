import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { monitoringLogger } from '@/lib/monitoring/logger';
import { requireHrAccess, toIso } from '../../_utils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 500);
    const cursor = req.nextUrl.searchParams.get('cursor');

    let query: FirebaseFirestore.Query = adminDb
      .collection('users')
      .where('tenantId', '==', access.user.tenantId)
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await adminDb.collection('users').doc(cursor).get();
      if (cursorDoc.exists && cursorDoc.data()?.tenantId === access.user.tenantId) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > limit;
    const pageDocs = snap.docs.slice(0, limit);

    const users = pageDocs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        ...data,
        createdAt: toIso(data?.createdAt),
        updatedAt: toIso(data?.updatedAt),
      };
    });

    return NextResponse.json({
      ok: true,
      users,
      pagination: {
        hasMore,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
      },
      currentUser: {
        uid: access.user.uid,
        role: access.user.role,
        name: access.user.name || null,
        email: access.user.email || null,
      },
    });
  } catch (err) {
    monitoringLogger
      .error('HR employees list error', 'hr', {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
