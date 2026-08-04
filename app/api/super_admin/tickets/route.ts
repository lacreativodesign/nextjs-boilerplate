import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../_utils';
import { PLATFORM_TICKETS_COLLECTION, parseTicketStatus } from '@/lib/support/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as any).toDate === 'function'
  ) {
    const date = (value as any).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return null;
}

/**
 * Cross-tenant ticket queue for the super admin. platform_tickets is a
 * top-level collection, so this reads every tenant's tickets in one query —
 * the whole reason tickets live at top level rather than in a per-tenant
 * subcollection.
 *
 * Optional ?status= filter is applied server-side (indexed). priority and
 * triageStatus filtering is left to the client to avoid requiring a composite
 * for every combination; the result set is capped and small.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const url = new URL(req.url);
    const statusFilter = parseTicketStatus(url.searchParams.get('status'));

    let query = adminDb
      .collection(PLATFORM_TICKETS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(300) as FirebaseFirestore.Query;

    if (statusFilter) {
      query = adminDb
        .collection(PLATFORM_TICKETS_COLLECTION)
        .where('status', '==', statusFilter)
        .orderBy('createdAt', 'desc')
        .limit(300);
    }

    const snap = await query.get();

    return NextResponse.json({
      ok: true,
      tickets: snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      }),
    });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    if (status === 500) console.error('SUPER_ADMIN_TICKETS_LIST_ERROR', err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
