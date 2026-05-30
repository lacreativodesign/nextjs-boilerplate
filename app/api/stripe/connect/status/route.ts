import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || "");
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};

    return NextResponse.json({
      ok: true,
      connected: tenantData.stripeConnectStatus === "active",
      accountId: tenantData.stripeConnectAccountId || null,
      email: tenantData.stripeConnectEmail || null,
      businessName: tenantData.stripeConnectBusinessName || null,
      chargesEnabled: Boolean(tenantData.stripeConnectChargesEnabled),
      payoutsEnabled: Boolean(tenantData.stripeConnectPayoutsEnabled),
      connectedAt: tenantData.stripeConnectConnectedAt || null,
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : undefined) || "Unable to fetch Stripe Connect status.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
