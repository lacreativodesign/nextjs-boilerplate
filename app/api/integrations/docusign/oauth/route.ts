import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import {
  buildDocusignAuthorizeUrl,
  connectDocusignFromCode,
  consumeDocusignOAuthState,
  createDocusignOAuthState,
  getDocusignConnection,
} from "@/lib/integrations/docusign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));

    if (body?.start) {
      const state = await createDocusignOAuthState({
        tenantId: auth.user.tenantId,
        userUid: auth.user.uid,
        returnTo: typeof body.returnTo === "string" ? body.returnTo : "/admin/settings/integrations/docusign",
      });

      return NextResponse.json({ ok: true, authorizeUrl: buildDocusignAuthorizeUrl(state) });
    }

    const code = typeof body?.code === "string" ? body.code : "";
    const state = typeof body?.state === "string" ? body.state : "";
    if (!code || !state) {
      return NextResponse.json({ ok: false, error: "code and state are required." }, { status: 400 });
    }

    const statePayload = await consumeDocusignOAuthState(state);
    if (statePayload.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant mismatch for OAuth state." }, { status: 403 });
    }

    await connectDocusignFromCode({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      code,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "DocuSign OAuth failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";

  if (!code || !state) {
    if (error) {
      return NextResponse.redirect(
        new URL(`/admin/settings/integrations/docusign?docusign_error=${encodeURIComponent(error)}`, request.url)
      );
    }

    try {
      const auth = await requireAdmin();
      if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
      const connection = await getDocusignConnection(auth.user.tenantId as string);
      return NextResponse.json({ ok: true, connection });
    } catch (readError) {
      return NextResponse.json({ ok: false, error: (readError instanceof Error ? readError.message : undefined) || "Unable to fetch DocuSign state." }, { status: 500 });
    }
  }

  try {
    const payload = await consumeDocusignOAuthState(state);
    await connectDocusignFromCode({
      tenantId: payload.tenantId,
      userUid: payload.userUid,
      code,
    });

    return NextResponse.redirect(new URL(`${payload.returnTo}?docusign_connected=1`, request.url));
  } catch (oauthError) {
    return NextResponse.redirect(
      new URL(
        `/admin/settings/integrations/docusign?docusign_error=${encodeURIComponent((oauthError instanceof Error ? oauthError.message : undefined) || "oauth_failed")}`,
        request.url
      )
    );
  }
}
