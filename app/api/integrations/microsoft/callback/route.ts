import { NextResponse } from "next/server";
import {
  consumeMicrosoftOAuthState,
  exchangeMicrosoftCodeForTokens,
  getMicrosoftProfile,
  saveMicrosoftTokens,
} from "@/lib/integrations/microsoft-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL(`/admin/settings/integrations?microsoft_error=${encodeURIComponent(error)}`, request.url));
    }
    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/settings/integrations?microsoft_error=invalid_callback", request.url));
    }

    const stateRecord = await consumeMicrosoftOAuthState(state);
    const tokenPayload = await exchangeMicrosoftCodeForTokens(code);
    const profile = await getMicrosoftProfile(tokenPayload.access_token);

    await saveMicrosoftTokens({
      tenantId: stateRecord.tenantId,
      userUid: stateRecord.userUid,
      accountEmail: profile.email,
      accountDisplayName: profile.displayName,
      microsoftTenantId: profile.tenantId,
      tokenPayload,
    });

    return NextResponse.redirect(new URL(`${stateRecord.returnTo}?microsoft_connected=1`, request.url));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "oauth_failed";
    return NextResponse.redirect(new URL(`/admin/settings/integrations?microsoft_error=${encodeURIComponent(message)}`, request.url));
  }
}
