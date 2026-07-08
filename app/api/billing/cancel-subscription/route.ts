import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  // Deprecated: subscription cancellation is handled solely by
  // /api/billing/subscription/cancel, which routes state through the canonical
  // billing service. Retired to prevent duplicate, conflicting writes to
  // tenant billing state.
  return NextResponse.json(
    {
      ok: false,
      error: 'This endpoint is deprecated. Use /api/billing/subscription/cancel',
    },
    { status: 410 },
  );
}
