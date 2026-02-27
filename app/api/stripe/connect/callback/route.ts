import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { exchangeConnectCode, getConnectAccount } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithQuery(baseUrl: URL, value: string, reason?: string): NextResponse {
  const redirectUrl = new URL("/settings/payments", baseUrl.origin);
  redirectUrl.searchParams.set("connect", value);
  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(redirectUrl, 303);
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const error = requestUrl.searchParams.get("error");
    if (error) {
      return redirectWithQuery(requestUrl, "error", error);
    }

    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    if (!code || !state) {
      return redirectWithQuery(requestUrl, "error", "invalid_callback");
    }

    const [tenantId, userId, ...extra] = state.split(":");
    if (!tenantId || !userId || extra.length > 0) {
      return redirectWithQuery(requestUrl, "error", "invalid_state");
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return redirectWithQuery(requestUrl, "error", "tenant_not_found");
    }

    const { accountId } = await exchangeConnectCode(code);
    const account = await getConnectAccount(accountId);
    if (!account) {
      return redirectWithQuery(requestUrl, "error", "account_fetch_failed");
    }

    const now = new Date().toISOString();
    await tenantRef.set(
      {
        stripeConnectAccountId: accountId,
        stripeConnectStatus: "active",
        stripeConnectEmail: account.email || null,
        stripeConnectBusinessName: account.business_profile?.name || account.display_name || null,
        stripeConnectConnectedAt: now,
        stripeConnectChargesEnabled: Boolean(account.charges_enabled),
        stripeConnectPayoutsEnabled: Boolean(account.payouts_enabled),
        updatedAt: now,
      },
      { merge: true },
    );

    await adminDb.collection("audit_logs").add({
      tenantId,
      action: "stripe_connect_connected",
      performedBy: userId,
      details: {
        accountId,
        email: account.email || null,
      },
      timestamp: now,
    });

    return redirectWithQuery(requestUrl, "success");
  } catch (error) {
    console.error("[STRIPE_CONNECT] Callback failed", error);
    const requestUrl = new URL(req.url);
    return redirectWithQuery(requestUrl, "error", "callback_failed");
  }
}
