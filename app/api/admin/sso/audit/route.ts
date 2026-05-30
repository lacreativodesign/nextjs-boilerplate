import { type NextRequest, NextResponse } from "next/server";
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
    const tenantId = url.searchParams.get("tenantId") || authResult.user.tenantId;
    const limit = Number(url.searchParams.get("limit") || "100");

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId is required." }, { status: 400 });
    }

    const logs = await listSsoAuditLogs(tenantId as string, limit);
    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to load SSO audit logs." }, { status: 400 });
  }
}
