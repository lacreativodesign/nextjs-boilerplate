import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { linkSsoForUser, type SsoProvider } from "@/lib/auth/sso-oauth";

export const runtime = "nodejs";

function asProvider(value: string): SsoProvider {
  if (value === "google" || value === "microsoft" || value === "okta" || value === "auth0") {
    return value;
  }
  throw new Error("Unsupported SSO provider.");
}

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = await getTenantIdForRequestOrThrow(req as unknown);
    const provider = asProvider(params.provider);
    const body = await req.json();

    const code = String(body.code || "");
    const redirectUri = String(body.redirectUri || "");
    const codeVerifier = String(body.codeVerifier || "");

    if (!code || !redirectUri || !codeVerifier) {
      return NextResponse.json({ ok: false, error: "Missing OAuth payload." }, { status: 400 });
    }

    const identity = await linkSsoForUser({
      tenantId,
      uid: me.uid,
      provider,
      code,
      redirectUri,
      codeVerifier,
    });

    return NextResponse.json({ ok: true, identity });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to link SSO account." }, { status: 400 });
  }
}
