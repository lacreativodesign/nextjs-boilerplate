import { NextRequest, NextResponse } from "next/server";
import { consumeCalendlyOAuthState, exchangeCalendlyCodeForTokens, saveCalendlyConnection } from "@/lib/integrations/calendly";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/settings/integrations?calendly_error=missing_oauth_params", request.url));
    }

    const oauthState = await consumeCalendlyOAuthState(state);
    const tokens = await exchangeCalendlyCodeForTokens(code);

    await saveCalendlyConnection({
      tenantId: oauthState.tenantId,
      userUid: oauthState.userUid,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    const redirect = new URL(oauthState.returnTo || "/admin/settings/integrations", request.url);
    redirect.searchParams.set("calendly", "connected");
    return NextResponse.redirect(redirect);
  } catch (error: any) {
    const redirect = new URL("/admin/settings/integrations", request.url);
    redirect.searchParams.set("calendly_error", error?.message || "oauth_failed");
    return NextResponse.redirect(redirect);
  }
}
