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
    // USAGE-1: the tenant filter belongs in the QUERY, not in a post-filter.
    //
    // This read the most recent `pageSize` rows across EVERY tenant and then discarded the
    // ones that did not belong to the caller. Two things followed. A tenant admin asking
    // for 25 rows got the 25 newest rows platform-wide, filtered down — so on a busy
    // platform they saw a handful, or none at all, while their own usage history sat there
    // in full. The page reported "no API usage" as a fact about their workspace when it
    // was really a fact about somebody else's traffic volume.
    //
    // And the read itself was unscoped: another tenant's log documents were pulled into
    // this process on every request. Nothing reached the client, because the filter ran
    // first — but the isolation depended entirely on a line of array code rather than on
    // the query, and one edit that forgot it would have leaked directly.
    let query = adminDb.collection('api_usage_logs').orderBy('createdAt', 'desc');
    if (current.role !== 'super_admin') {
      query = query.where('tenantId', '==', current.tenantId);
    }

    const snap = await query.limit(pageSize).get();

    const logs = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, any>),
    })) as Array<{ id: string } & Record<string, any>>;

    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    console.error('usage logs error', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
