import { type NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getQuickBooksIntegration, updateQuickBooksSettings } from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const integration = await getQuickBooksIntegration(auth.user.tenantId as string);

    return NextResponse.json({
      ok: true,
      status: {
        connected: Boolean(integration?.connected),
        companyId: integration?.companyId || null,
        companyName: integration?.companyName || null,
        scopes: integration?.scopes || [],
        settings: integration?.settings || null,
        cursor: integration?.cursor || null,
        stats: integration?.stats || null,
      },
    });
  } catch (error) {
    console.error("quickbooks/status error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to load QuickBooks status." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const settings = await updateQuickBooksSettings(auth.user.tenantId as string, auth.user.uid, body || {});
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("quickbooks/status PUT error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to update settings." }, { status: 500 });
  }
}
