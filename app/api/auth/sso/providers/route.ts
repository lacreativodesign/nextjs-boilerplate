import { type NextRequest, NextResponse } from "next/server";
import { listEnabledSsoProviders } from "@/lib/auth/sso-oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId is required." }, { status: 400 });
    }

    const providers = await listEnabledSsoProviders(tenantId);
    return NextResponse.json({ ok: true, providers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to load SSO providers." }, { status: 400 });
  }
}
