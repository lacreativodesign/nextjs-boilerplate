import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { deriveSubscriptionState } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(req);
    const tenantId = await getTenantIdForRequestOrThrow(req);
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;

    const subscriptionState = tenant
      ? deriveSubscriptionState({
          subscriptionState: (tenant as any).subscriptionState,
          billingStatus: (tenant as any).billingStatus,
        })
      : "active";

    return NextResponse.json({
      ok: true,
      subscriptionState,
      role: user.role || "unknown",
    });
  } catch (err: any) {
    const message = err?.message || "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Tenant suspended" ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
