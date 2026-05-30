import { type NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getQuickBooksSyncLogs } from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
    const logs = await getQuickBooksSyncLogs(auth.user.tenantId as string, Number.isFinite(limit) ? limit : 50);

    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    console.error("quickbooks/logs error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to load QuickBooks logs." }, { status: 500 });
  }
}
