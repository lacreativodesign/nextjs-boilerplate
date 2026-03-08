import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { buildQuickBooksAuthorizeUrl, createQuickBooksOAuthState } from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const returnTo = request.nextUrl.searchParams.get("returnTo") || "/admin/settings/integrations/quickbooks";
    const state = await createQuickBooksOAuthState({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      returnTo,
    });

    return NextResponse.redirect(buildQuickBooksAuthorizeUrl(state));
  } catch (error: any) {
    console.error("quickbooks/authorize error", error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to start QuickBooks OAuth." }, { status: 500 });
  }
}
