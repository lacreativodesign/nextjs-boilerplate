import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getXeroIntegration, updateXeroSettings } from "@/lib/integrations/xero";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const integration = await getXeroIntegration(auth.user.tenantId);
    return NextResponse.json({
      ok: true,
      status: {
        connected: Boolean(integration?.connected),
        organizationId: integration?.organizationId || null,
        organizationName: integration?.organizationName || null,
        scopes: integration?.scopes || [],
        settings: integration?.settings || null,
        cursor: integration?.cursor || null,
        stats: integration?.stats || null,
      },
    });
  } catch (error: any) {
    console.error("xero/status error", error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to load Xero status." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    const body = await request.json();
    const settings = await updateXeroSettings(auth.user.tenantId, auth.user.uid, body || {});
    return NextResponse.json({ ok: true, settings });
  } catch (error: any) {
    console.error("xero/status PUT error", error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to update settings." }, { status: 500 });
  }
}
