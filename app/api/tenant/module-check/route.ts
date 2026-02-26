import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isModuleEnabled } from "@/lib/tenant/access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const moduleKey = req.nextUrl.searchParams.get("module");

    if (!tenantId || !moduleKey) {
      return NextResponse.json({ ok: false, error: "tenantId and module are required" }, { status: 400 });
    }

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      const notFound = NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
      notFound.headers.set("Cache-Control", "private, max-age=30");
      return notFound;
    }

    const tenantData = tenantSnap.data() || {};
    const modulesEnabled = (tenantData.modulesEnabled || {}) as Record<string, boolean>;
    const enabled = isModuleEnabled(modulesEnabled, moduleKey);

    const response = NextResponse.json({ ok: true, enabled });
    response.headers.set("Cache-Control", "private, max-age=30");
    return response;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Server error" }, { status: 500 });
  }
}
