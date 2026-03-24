import { NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Stripe Connect not configured." }, { status: 500 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bizosto.com").replace(/\/$/, "");
    const redirectUri = `${appUrl}/api/billing/terminal/oauth-callback`;
    const state = String(auth.user.tenantId || "").trim();

    if (!state) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 400 });
    }

    const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ ok: true, url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
