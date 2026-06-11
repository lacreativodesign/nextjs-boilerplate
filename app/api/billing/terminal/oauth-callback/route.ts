import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/payments/stripe";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bizosto.com").replace(/\/$/, "");

    if (error || !code || !state) {
      return NextResponse.redirect(`${appUrl}/billing/terminal?connect_error=1`);
    }

    const nonceRef = adminDb.collection("stripe_connect_states").doc(state);
    const nonceSnap = await nonceRef.get();

    if (!nonceSnap.exists) {
      return NextResponse.redirect(`${appUrl}/billing/terminal?connect_error=1`);
    }

    const nonceData = nonceSnap.data() as {
      tenantId: string;
      uid: string;
      createdAt: string;
      expiresAt: string;
      consumedAt: string | null;
    };

    if (nonceData.consumedAt !== null) {
      return NextResponse.redirect(`${appUrl}/billing/terminal?connect_error=1`);
    }

    if (new Date(nonceData.expiresAt) < new Date()) {
      return NextResponse.redirect(`${appUrl}/billing/terminal?connect_error=1`);
    }

    const tenantId = nonceData.tenantId;

    const stripe = getStripeClient();
    const response = await stripe.oauth.token({ grant_type: "authorization_code", code });
    const stripeConnectAccountId = response.stripe_user_id;

    if (!stripeConnectAccountId) {
      return NextResponse.redirect(`${appUrl}/billing/terminal?connect_error=1`);
    }

    await adminDb
      .collection("tenants")
      .doc(tenantId)
      .set({ stripeConnectAccountId, updatedAt: new Date().toISOString() }, { merge: true });

    await nonceRef.set({ consumedAt: new Date().toISOString() }, { merge: true });

    return NextResponse.redirect(`${appUrl}/billing/terminal?connect_success=1`);
  } catch (error: unknown) {
    console.error("Stripe Connect OAuth callback error:", error);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bizosto.com").replace(/\/$/, "");
    return NextResponse.redirect(`${appUrl}/billing/terminal?connect_error=1`);
  }
}
