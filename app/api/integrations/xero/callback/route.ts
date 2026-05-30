import { type NextRequest, NextResponse } from "next/server";
import { consumeXeroOAuthState, exchangeXeroCodeForTokens, getXeroConnections, getXeroOAuthConfig, saveXeroConnection } from "@/lib/integrations/xero";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const code = String(request.nextUrl.searchParams.get("code") || "").trim();
    const state = String(request.nextUrl.searchParams.get("state") || "").trim();
    if (!code || !state) {
      return NextResponse.redirect(new URL("/admin/settings/integrations/xero?error=Missing+OAuth+parameters", request.url));
    }

    const oauthState = await consumeXeroOAuthState(state);
    const tokenPayload = await exchangeXeroCodeForTokens(code);
    const scopes = getXeroOAuthConfig().scopes;
    const connections = await getXeroConnections(tokenPayload.accessToken);
    const preferredOrgId = String(process.env.XERO_ORGANIZATION_ID || "").trim();
    const selected = connections.find((item) => getString((item as Record<string, unknown>)?.tenantId) === preferredOrgId) || connections[0];
    if (!(selected as Record<string, unknown>)?.tenantId) throw new Error("No Xero organization is available for this account.");

    await saveXeroConnection({
      tenantId: oauthState.tenantId,
      userUid: oauthState.userUid,
      organizationId: (selected as Record<string, unknown>).tenantId,
      organizationName: (selected as Record<string, unknown>).tenantName || null,
      scopes,
      tokenPayload,
    });

    const target = oauthState.returnTo || "/admin/settings/integrations/xero";
    const redirect = new URL(target, request.url);
    redirect.searchParams.set("connected", "1");
    return NextResponse.redirect(redirect);
  } catch (error) {
    console.error("xero/callback error", error);
    const redirect = new URL("/admin/settings/integrations/xero", request.url);
    redirect.searchParams.set("error", (error instanceof Error ? error.message : undefined) || "Xero OAuth failed");
    return NextResponse.redirect(redirect);
  }
}

function getString(value: unknown): string {
  return String(value || "").trim();
}
