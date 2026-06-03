import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(req);
    const tenantId = await getTenantIdForRequestOrThrow(req);
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? (tenantSnap.data() as any) : null;

    const trialEndsAt = tenant?.trialEndsAt || null;
    const now = new Date();

    // Derive subscription state — check trial expiry explicitly
    let subscriptionState: string;
    if (tenant?.subscriptionState) {
      subscriptionState = tenant.subscriptionState;
    } else if (tenant?.billingStatus === "past_due") {
      subscriptionState = "grace";
    } else if (tenant?.billingStatus === "canceled") {
      subscriptionState = "hard_locked";
    } else if (tenant?.plan === "trial" && trialEndsAt && new Date(trialEndsAt) < now) {
      subscriptionState = "grace";
    } else if (tenant?.billingStatus === "active") {
      subscriptionState = "active";
    } else if (tenantId === "bizosto" || tenantId === "bizosto-demo") {
      // Super-admin and demo tenants always get full access
      subscriptionState = "active";
    } else {
      // No subscription data — restrict to grace rather than granting full access
      subscriptionState = "grace";
    }

    return NextResponse.json({
      ok: true,
      plan: tenant?.plan || "trial",
      subscriptionState,
      billingStatus: tenant?.billingStatus || null,
      currentPeriodEnd: tenant?.currentPeriodEnd || null,
      trialEndsAt,
      role: user.role || "unknown",
    });
  } catch (err: any) {
    const message = err?.message || "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Tenant suspended" ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
