import { NextRequest, NextResponse } from "next/server";
import {
  consumeQuickBooksOAuthState,
  exchangeQuickBooksCodeForTokens,
  getQuickBooksCompanyInfo,
  getQuickBooksOAuthConfig,
  saveQuickBooksConnection,
} from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const code = String(request.nextUrl.searchParams.get("code") || "").trim();
    const state = String(request.nextUrl.searchParams.get("state") || "").trim();
    const realmId = String(request.nextUrl.searchParams.get("realmId") || "").trim();

    if (!code || !state || !realmId) {
      return NextResponse.redirect(new URL("/admin/settings/integrations/quickbooks?error=Missing+OAuth+parameters", request.url));
    }

    const oauthState = await consumeQuickBooksOAuthState(state);
    const tokenPayload = await exchangeQuickBooksCodeForTokens(code);

    const scopes = getQuickBooksOAuthConfig().scopes;
    const companyInfo = await getQuickBooksCompanyInfo(tokenPayload.accessToken, realmId);

    await saveQuickBooksConnection({
      tenantId: oauthState.tenantId,
      userUid: oauthState.userUid,
      realmId,
      companyName: companyInfo.companyName,
      scopes,
      tokenPayload,
    });

    const target = oauthState.returnTo || "/admin/settings/integrations/quickbooks";
    const redirect = new URL(target, request.url);
    redirect.searchParams.set("connected", "1");
    return NextResponse.redirect(redirect);
  } catch (error: any) {
    console.error("quickbooks/callback error", error);
    const redirect = new URL("/admin/settings/integrations/quickbooks", request.url);
    redirect.searchParams.set("error", error?.message || "QuickBooks OAuth failed");
    return NextResponse.redirect(redirect);
  }
}
