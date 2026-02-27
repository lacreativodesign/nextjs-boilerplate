import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getConnectAuthorizeUrl } from "@/lib/stripe/connect";
import { requireTenantStripeConnect } from "../_utils";

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

    const authorizeUrl = getConnectAuthorizeUrl(tenantId, userId);

    return NextResponse.json({ ok: true, url: authorizeUrl });
  } catch (error: any) {
    const message = error?.message || "Unable to start Stripe Connect.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
