import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(req as unknown as Parameters<typeof getCurrentUserOrThrow>[0]);
    const tenantId = await getTenantIdForRequestOrThrow(req as unknown as Parameters<typeof getTenantIdForRequestOrThrow>[0]);
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? (tenantSnap.data() as unknown) : null;

    const trialEndsAt = (tenant as Record<string, unknown>)?.trialEndsAt || null;
    const now = new Date();

    // Derive subscription state — check trial expiry explicitly
    let subscriptionState: string;
    if ((tenant as Record<string, unknown>)?.subscriptionState) {
      subscriptionState = String((tenant as Record<string, unknown>).subscriptionState);
    } else if ((tenant as Record<string, unknown>)?.billingStatus === "past_due") {
      subscriptionState = "grace";
    } else if ((tenant as Record<string, unknown>)?.billingStatus === "canceled") {
      subscriptionState = "hard_locked";
    } else if ((tenant as Record<string, unknown>)?.plan === "trial" && trialEndsAt && new Date(trialEndsAt as string) < now) {
      subscriptionState = "grace";
    } else {
      subscriptionState = "active";
    }

    return NextResponse.json({
      ok: true,
      plan: (tenant as Record<string, unknown>)?.plan || "trial",
      subscriptionState,
      billingStatus: (tenant as Record<string, unknown>)?.billingStatus || null,
      currentPeriodEnd: (tenant as Record<string, unknown>)?.currentPeriodEnd || null,
      trialEndsAt,
      role: user.role || "unknown",
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Tenant suspended" ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
