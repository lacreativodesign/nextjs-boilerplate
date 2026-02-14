import { NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getMonitoringDashboard } from "@/lib/monitoring/dashboard-service";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const data = await getMonitoringDashboard();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load monitoring dashboard",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
