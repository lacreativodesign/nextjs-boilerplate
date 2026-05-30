import { type NextRequest, NextResponse } from "next/server";
import { executeZapierSearch } from "@/lib/zapier/service";
import { requireZapierApiKey } from "@/app/api/zapier/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { search: string } }) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requireZapierApiKey(request, body);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const input = (body.input as Record<string, unknown>) || body;
    const result = await executeZapierSearch({
      tenantId: auth.tenantId,
      search: params.search,
      input,
    });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Search failed." }, { status: 400 });
  }
}
