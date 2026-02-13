import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import {
  buildMailchimpAuthorizeUrl,
  consumeMailchimpOAuthState,
  createMailchimpOAuthState,
  exchangeMailchimpCodeForAccessToken,
  fetchMailchimpMetadata,
  saveMailchimpApiKey,
  saveMailchimpConnection,
} from "@/lib/integrations/mailchimp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));

    if (body?.start) {
      const state = await createMailchimpOAuthState({
        tenantId: auth.user.tenantId,
        userUid: auth.user.uid,
        returnTo: typeof body.returnTo === "string" ? body.returnTo : "/admin/settings/integrations/mailchimp",
      });
      return NextResponse.json({ ok: true, authorizeUrl: buildMailchimpAuthorizeUrl(state) });
    }

    if (typeof body?.apiKey === "string") {
      await saveMailchimpApiKey({ tenantId: auth.user.tenantId, userUid: auth.user.uid, apiKey: body.apiKey });
      return NextResponse.json({ ok: true, message: "Mailchimp API key stored." });
    }

    const code = typeof body?.code === "string" ? body.code : "";
    const state = typeof body?.state === "string" ? body.state : "";
    if (!code || !state) {
      return NextResponse.json({ ok: false, error: "Either start, apiKey, or code/state is required." }, { status: 400 });
    }

    const statePayload = await consumeMailchimpOAuthState(state);
    if (statePayload.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant mismatch for OAuth state." }, { status: 403 });
    }

    const token = await exchangeMailchimpCodeForAccessToken(code);
    const metadata = await fetchMailchimpMetadata(token.accessToken);
    await saveMailchimpConnection({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      dc: metadata.dc,
      accountName: metadata.accountName,
      accountEmail: metadata.accountEmail,
      scopes: token.scopes,
      accessToken: token.accessToken,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Mailchimp OAuth failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";

  if (error) {
    return NextResponse.redirect(new URL(`/admin/settings/integrations/mailchimp?mailchimp_error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/settings/integrations/mailchimp?mailchimp_error=missing_code_or_state", request.url));
  }

  try {
    const payload = await consumeMailchimpOAuthState(state);
    const token = await exchangeMailchimpCodeForAccessToken(code);
    const metadata = await fetchMailchimpMetadata(token.accessToken);

    await saveMailchimpConnection({
      tenantId: payload.tenantId,
      userUid: payload.userUid,
      dc: metadata.dc,
      accountName: metadata.accountName,
      accountEmail: metadata.accountEmail,
      scopes: token.scopes,
      accessToken: token.accessToken,
    });

    return NextResponse.redirect(new URL(`${payload.returnTo}?mailchimp_connected=1`, request.url));
  } catch (oauthError: any) {
    return NextResponse.redirect(
      new URL(`/admin/settings/integrations/mailchimp?mailchimp_error=${encodeURIComponent(oauthError?.message || "oauth_failed")}`, request.url)
    );
  }
}
