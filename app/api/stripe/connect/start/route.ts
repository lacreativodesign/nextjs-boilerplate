import crypto from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "../../../../../lib/firebaseAdmin";
import { STRIPE_CONNECT_CLIENT_ID, STRIPE_CONNECT_REDIRECT_URI } from "@/lib/env";
import { requireTenantStripeConnect } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConnectClientId() {
  const clientId = STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) {
    throw new Error("STRIPE_CONNECT_CLIENT_ID is not configured.");
  }
  return clientId;
}

function getRedirectUri(req: NextRequest) {
  const provided = STRIPE_CONNECT_REDIRECT_URI;
  if (provided) return provided;
  return new URL("/api/stripe/connect/callback", req.nextUrl.origin).toString();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTenantStripeConnect();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const state = crypto.randomBytes(20).toString("hex");
    const tenantRef = adminDb.collection("tenants").doc(auth.user.tenantId);

    await tenantRef.set(
      {
        "stripeConnect.oauthState": state,
        "stripeConnect.oauthRequestedAt": admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", getConnectClientId());
    authorizeUrl.searchParams.set("scope", "read_write");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("redirect_uri", getRedirectUri(req));

    return NextResponse.redirect(authorizeUrl.toString(), 303);
  } catch (err: any) {
    const message = err?.message || "Unable to start Stripe Connect.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
