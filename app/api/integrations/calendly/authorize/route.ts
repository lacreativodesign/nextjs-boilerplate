import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { buildCalendlyAuthorizeUrl, createCalendlyOAuthState } from "@/lib/integrations/calendly";

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const returnTo = request.nextUrl.searchParams.get("returnTo") || "/admin/settings/integrations";
    const state = await createCalendlyOAuthState({ tenantId: me.tenantId, userUid: me.uid, returnTo });
    const url = buildCalendlyAuthorizeUrl(state);

    return NextResponse.redirect(url);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to start Calendly OAuth." }, { status: 400 });
  }
}
