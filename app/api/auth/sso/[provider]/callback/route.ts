import { type NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback, type SsoProvider } from "@/lib/auth/sso-oauth";

export const runtime = "nodejs";

function asProvider(value: string): SsoProvider {
  if (value === "google" || value === "microsoft" || value === "okta" || value === "auth0") {
    return value;
  }
  throw new Error("Unsupported SSO provider.");
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = asProvider(params.provider);
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";

  if (!state || !code) {
    return NextResponse.redirect(new URL("/login?error=sso_missing_code", req.url));
  }

  try {
    const result = await handleOAuthCallback({ provider, state, code });

    if (result.mode === "link") {
      return NextResponse.redirect(new URL(`${result.returnTo}?ssoLinked=1`, req.url));
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("ssoToken", result.customToken);
    loginUrl.searchParams.set("returnTo", result.returnTo || "/");
    return NextResponse.redirect(loginUrl, { status: 302 });
  } catch (error) {
    console.error("SSO callback failed", error);
    const redirect = new URL("/login", req.url);
    redirect.searchParams.set("error", (error instanceof Error ? error.message : undefined) || "SSO login failed");
    return NextResponse.redirect(redirect, { status: 302 });
  }
}
