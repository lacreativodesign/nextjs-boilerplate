import { NextResponse } from "next/server";
import {
  consumeGoogleOAuthState,
  exchangeGoogleCodeForTokens,
  getGoogleProfile,
  saveGoogleTokens,
} from "@/lib/integrations/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL(`/admin/settings/integrations?google_error=${encodeURIComponent(error)}`, request.url));
    }
    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/settings/integrations?google_error=invalid_callback", request.url));
    }

    const stateRecord = await consumeGoogleOAuthState(state);
    const tokenPayload = await exchangeGoogleCodeForTokens(code);
    const profile = await getGoogleProfile(tokenPayload.access_token);

    await saveGoogleTokens({
      tenantId: stateRecord.tenantId,
      userUid: stateRecord.userUid,
      accountEmail: profile.email,
      tokenPayload,
    });

    return NextResponse.redirect(new URL(`${stateRecord.returnTo}?google_connected=1`, request.url));
  } catch (err: any) {
    return NextResponse.redirect(new URL(`/admin/settings/integrations?google_error=${encodeURIComponent(err?.message || "oauth_failed")}`, request.url));
  }
}
