import { type NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { runXeroSync, updateXeroSettings } from "@/lib/integrations/xero";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json().catch(() => ({}))) as { forceInitial?: boolean; settings?: Record<string, unknown> };
    if (body.settings && typeof body.settings === "object") {
      await updateXeroSettings(String(auth.user.tenantId || ""), auth.user.uid, body.settings as Partial<import("@/lib/integrations/xero").XeroSyncSettings>);
    }

    const result = await runXeroSync({ tenantId: String(auth.user.tenantId || ""), userUid: auth.user.uid, forceInitial: Boolean(body.forceInitial) });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("xero/sync error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Xero sync failed." }, { status: 500 });
  }
}
