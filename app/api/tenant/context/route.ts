import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { getTenantPlanState } from "@/app/lib/plan-enforcement";
import { deriveSubscriptionState } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(req as unknown as Parameters<typeof getCurrentUserOrThrow>[0]);

    // super_admin is platform-level — no tenant required
    if (user.role === "super_admin") {
      return NextResponse.json({
        ok: true,
        user: {
          uid: user.uid,
          role: user.role,
          tenantId: "bizosto",
          status: "active",
          displayName: user.displayName || user.name || null,
          email: user.email || null,
          language: null,
          locale: null,
        },
        tenant: null,
      });
    }

    const tenantId = await getTenantIdForRequestOrThrow(req as unknown as Parameters<typeof getTenantIdForRequestOrThrow>[0]);
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;
    const planState = tenant ? await getTenantPlanState(tenantId) : null;
    const subscriptionState = tenant
      ? deriveSubscriptionState({
          subscriptionState: (tenant as Record<string, unknown>).subscriptionState as string | undefined,
          billingStatus: (tenant as Record<string, unknown>).billingStatus as string | undefined,
        })
      : "active";

    return NextResponse.json({
      ok: true,
      user: {
        uid: user.uid,
        role: user.role,
        tenantId: tenantId,
        status: user.status || "active",
        displayName: user.displayName || user.name || null,
        email: user.email || null,
        language: user.language || null,
        locale: user.locale || user.language || null,
      },
      tenant: tenant
        ? {
            id: tenantId,
            name: tenant.name || "",
            slug: tenant.slug || "",
            status: tenant.status || "active",
            brand: tenant.brand || null,
            whiteLabel: tenant.whiteLabel || null,
            modulesEnabled: tenant.modulesEnabled || {},
            rolesEnabled: tenant.rolesEnabled || {},
            plan: planState?.plan || "pro",
            modules: planState?.modules || {},
            subscriptionState,
            stripeConnect: tenant.stripeConnect || null,
          }
        : null,
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Tenant suspended" ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
