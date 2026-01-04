import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/app/api/super-admin/_utils";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { migrateMissingTenantIds } from "@/lib/tenant/migration";

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          ok: false,
          error: "Run the migration script manually in production.",
          command: "tsx scripts/migrateTenantId.ts <TENANT_ID>",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenantId || DEFAULT_TENANT_ID).trim();
    await migrateMissingTenantIds(tenantId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
