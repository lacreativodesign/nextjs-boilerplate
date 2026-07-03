import { NextResponse } from 'next/server';
export async function POST() {
  // Deprecated: Use /api/stripe/webhook instead
  return NextResponse.json(
    { error: 'This webhook endpoint is deprecated. Use /api/stripe/webhook' },
    { status: 410 },
  );
}
