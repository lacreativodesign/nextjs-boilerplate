import { type NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { runQuickBooksSync, updateQuickBooksSettings } from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      forceInitial?: boolean;
      settings?: Record<string, unknown>;
    };

    if (body.settings && typeof body.settings === "object") {
      await updateQuickBooksSettings(auth.user.tenantId as string, auth.user.uid, body.settings as unknown);
    }

    const result = await runQuickBooksSync({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      forceInitial: Boolean(body.forceInitial),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("quickbooks/sync error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "QuickBooks sync failed." }, { status: 500 });
  }
}
