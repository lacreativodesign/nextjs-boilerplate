import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S15: lists aggregated CSP violations so the strict policy can be promoted from
 * Report-Only to enforced on the basis of evidence rather than hope.
 *
 * The violations here are what the strict nonce-based policy WOULD have blocked. An empty
 * list across a representative period of real usage is the signal that enforcement is safe.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const snap = await adminDb
      .collection('csp_violations')
      .orderBy('count', 'desc')
      .limit(100)
      .get();

    const violations = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        directive: String(data.directive || ''),
        blockedOrigin: String(data.blockedOrigin || ''),
        documentPath: String(data.documentPath || ''),
        count: Number(data.count || 0),
        lastSeenAt: data.lastSeenAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ ok: true, violations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/** Clears the aggregate so a fresh observation window can be started. */
export async function DELETE(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const snap = await adminDb.collection('csp_violations').limit(500).get();
    const batch = adminDb.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    return NextResponse.json({ ok: true, cleared: snap.size });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
