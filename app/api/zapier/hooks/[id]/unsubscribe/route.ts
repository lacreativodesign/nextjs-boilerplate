import { NextRequest, NextResponse } from "next/server";
import { deleteZapierHookSubscription } from "@/lib/zapier/service";
import { requireZapierApiKey } from "@/app/api/zapier/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requireZapierApiKey(request, body);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const deleted = await deleteZapierHookSubscription({ id: params.id, tenantId: auth.tenantId });
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Subscription not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
