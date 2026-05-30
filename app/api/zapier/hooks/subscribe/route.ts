import { type NextRequest, NextResponse } from "next/server";
import { createZapierHookSubscription, ZAPIER_TRIGGER_TO_EVENT, type ZapierTriggerKey } from "@/lib/zapier/service";
import { requireZapierApiKey } from "@/app/api/zapier/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requireZapierApiKey(request, body);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const triggerKey = String(body.triggerKey || body.trigger_key || "").trim() as ZapierTriggerKey;
  const targetUrl = String(body.targetUrl || body.target_url || "").trim();

  if (!triggerKey || !(triggerKey in ZAPIER_TRIGGER_TO_EVENT)) {
    return NextResponse.json({ ok: false, error: "Invalid triggerKey." }, { status: 400 });
  }

  if (!targetUrl) {
    return NextResponse.json({ ok: false, error: "targetUrl is required." }, { status: 400 });
  }

  const hook = await createZapierHookSubscription({
    tenantId: auth.tenantId,
    triggerKey,
    targetUrl,
  });

  return NextResponse.json({ ok: true, id: hook.id, hook }, { status: 201 });
}
