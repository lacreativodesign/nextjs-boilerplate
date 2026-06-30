import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Deprecated: self-serve subscription creation is handled solely by
  // /api/stripe/checkout. This redundant direct-subscribe endpoint is retired to
  // prevent a divergent second price-resolution path.
  return NextResponse.json(
    { ok: false, error: "This endpoint is deprecated. Use /api/stripe/checkout." },
    { status: 410 },
  );
}
