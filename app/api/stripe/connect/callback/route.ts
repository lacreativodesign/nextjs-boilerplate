import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { adminDb } from "../../../../../lib/firebaseAdmin";
import { createRoleNotifications } from "../../../../../lib/notifications";
import { writeAuditLog } from "../../../../../lib/tenant/audit";
import { requireTenantStripeConnect } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_CONNECT_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_CONNECT_SECRET_KEY is not configured.");
  }
  return new Stripe(secretKey, { apiVersion: "2024-06-20" });
}

function getRedirectUri(req: NextRequest) {
  const provided = process.env.STRIPE_CONNECT_REDIRECT_URI;
  if (provided) return provided;
  return new URL("/api/stripe/connect/callback", req.nextUrl.origin).toString();
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantStripeConnect();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const error = req.nextUrl.searchParams.get("error");
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (!code || !state) {
      return NextResponse.json({ ok: false, error: "Missing OAuth details." }, { status: 400 });
    }

    const tenantRef = adminDb.collection("tenants").doc(auth.user.tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: "Tenant not found." }, { status: 404 });
    }

    const tenantData = tenantSnap.data() || {};
    const stripeConnect = (tenantData.stripeConnect || {}) as Record<string, any>;
    if (stripeConnect.oauthState && stripeConnect.oauthState !== state) {
      return NextResponse.json({ ok: false, error: "Invalid OAuth state." }, { status: 400 });
    }

    const stripe = getStripeClient();
    const tokenResponse = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(req),
    });

    const stripeAccountId = tokenResponse.stripe_user_id;
    if (!stripeAccountId) {
      return NextResponse.json({ ok: false, error: "Stripe account not returned." }, { status: 400 });
    }

    const account = await stripe.accounts.retrieve(stripeAccountId);
    const accountEmail = typeof account.email === "string" ? account.email : null;
    const alreadyConnected =
      stripeConnect.status === "connected" && stripeConnect.accountId === stripeAccountId;

    await tenantRef.set(
      {
        "stripeConnect.enabled": true,
        "stripeConnect.accountId": stripeAccountId,
        "stripeConnect.accountEmail": accountEmail,
        "stripeConnect.status": "connected",
        "stripeConnect.connectedAt": admin.firestore.FieldValue.serverTimestamp(),
        "stripeConnect.disconnectedAt": null,
        "stripeConnect.oauthState": null,
        "stripeConnect.oauthRequestedAt": null,
      },
      { merge: true }
    );

    if (!alreadyConnected) {
      await writeAuditLog({
        tenantId: auth.user.tenantId,
        actorUserId: auth.user.uid,
        actorName: auth.user.displayName || auth.user.email || null,
        actorRole: auth.user.role,
        actionType: "stripe_connect_connected",
        entityType: "tenant",
        entityId: auth.user.tenantId,
        metadata: {
          stripeAccountId,
          stripeAccountEmail: accountEmail,
        },
      });

      await createRoleNotifications({
        tenantId: auth.user.tenantId,
        roles: ["admin"],
        title: "Stripe connected",
        body: accountEmail
          ? `Stripe Connect is linked to ${accountEmail}.`
          : "Stripe Connect is now linked to your account.",
        type: "success",
        priority: "normal",
        entityType: "tenant",
        entityId: auth.user.tenantId,
        deepLink: "/settings/payments",
        createdBy: { uid: auth.user.uid, name: auth.user.displayName || auth.user.email || "Tenant admin" },
        metadata: {
          stripeAccountId,
          stripeAccountEmail: accountEmail,
        },
      });
    }

    return NextResponse.redirect(new URL("/settings/payments", req.nextUrl.origin), 303);
  } catch (err: any) {
    const message = err?.message || "Stripe connect callback failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
