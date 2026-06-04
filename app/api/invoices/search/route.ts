import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Redirect legacy path to canonical finance invoices endpoint
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const canonical = url.origin + "/api/finance/invoices" + (url.search || "");
  return NextResponse.redirect(canonical, { status: 308 });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const canonical = url.origin + "/api/finance/invoices" + (url.search || "");
  return NextResponse.redirect(canonical, { status: 308 });
}
