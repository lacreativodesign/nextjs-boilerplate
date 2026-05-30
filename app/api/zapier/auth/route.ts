import { type NextRequest, NextResponse } from "next/server";
import { requireZapierApiKey } from "@/app/api/zapier/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requireZapierApiKey(request, body);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({ ok: true, tenantId: auth.tenantId }, { status: 200 });
}
