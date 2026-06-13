import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { listSsoAuditLogs } from "@/lib/auth/sso-oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdminOrSuperAdmin();
    if (!authResult.ok) {
      return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
    }

    const url = new URL(req.url);
    const isSuperAdmin = String(authResult.user.role || "").toLowerCase() === "super_admin";
    const requestedTenantId = url.searchParams.get("tenantId");
    // Only the platform super_admin may read another tenant's SSO audit logs.
    // Normal tenant admins are always scoped to their own tenant.
    const tenantId = isSuperAdmin && requestedTenantId ? requestedTenantId : authResult.user.tenantId;
    const limit = Number(url.searchParams.get("limit") || "100");

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId is required." }, { status: 400 });
    }

    const logs = await listSsoAuditLogs(tenantId, limit);
    return NextResponse.json({ ok: true, logs });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to load SSO audit logs." }, { status: 400 });
  }
}
