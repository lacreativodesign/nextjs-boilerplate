import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Deprecated: subscription & invoice events are handled solely by
  // /api/stripe/subscription-webhook. Retired to prevent duplicate,
  // conflicting writes to tenant billing state.
  return NextResponse.json(
    { ok: false, error: "This webhook endpoint is deprecated. Use /api/stripe/subscription-webhook" },
    { status: 410 }
  );
}
