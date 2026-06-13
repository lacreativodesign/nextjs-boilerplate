import crypto from "crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getConnectAuthorizeUrl } from "@/lib/stripe/connect";
import { requireTenantStripeConnect } from "../_utils";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireTenantStripeConnect();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || "");
    const userId = String(auth.user.uid || "");
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};

    if (tenantData.stripeConnectAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripe account already connected. Disconnect first to reconnect.",
        },
        { status: 400 },
      );
    }

    // Generate a single-use, unguessable OAuth state nonce and persist it
    // server-side mapped to tenant/user. The callback validates + consumes it.
    const state = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    await adminDb.collection("stripe_connect_oauth_states").doc(state).set({
      tenantId,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + OAUTH_STATE_TTL_MS).toISOString(),
    });

    const authorizeUrl = getConnectAuthorizeUrl(state);

    return NextResponse.json({ ok: true, url: authorizeUrl });
  } catch (error: any) {
    const message = error?.message || "Unable to start Stripe Connect.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
