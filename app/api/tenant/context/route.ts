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
    const tenant = tenantSnap.exists ? tenantSnap.data() : null;

    const res = NextResponse.json({
      ok: true,
      user: {
        uid: user.uid,
        role: user.role,
        tenantId: tenantId,
        status: user.status || "active",
        displayName: user.displayName || user.name || null,
        email: user.email || null,
      },
      tenant: tenant
        ? {
            id: tenantId,
            name: tenant.name || "",
            slug: tenant.slug || "",
            status: tenant.status || "active",
            brand: tenant.brand || null,
            modulesEnabled: tenant.modulesEnabled || {},
          }
        : null,
    });
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    res.cookies.set({
      name: "lac_role",
      value: user.role || "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
    return res;
  } catch (err: any) {
    const message = err?.message || "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Tenant suspended" ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
