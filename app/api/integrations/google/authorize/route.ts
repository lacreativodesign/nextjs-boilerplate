import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { buildGoogleAuthUrl, storeGoogleOAuthState } from "@/lib/integrations/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get("returnTo") || "/admin/settings/integrations";

    const { state, url, expiresAt } = buildGoogleAuthUrl({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      returnTo,
    });

    await storeGoogleOAuthState({
      state,
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      returnTo,
      expiresAt,
    });

    return NextResponse.redirect(url);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to start Google OAuth." }, { status: 500 });
  }
}
