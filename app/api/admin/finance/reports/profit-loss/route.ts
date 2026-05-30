import { type NextRequest, NextResponse } from "next/server";
import { generateProfitLoss } from "@/lib/reports/profitLoss";
import { requireAdmin } from "../../_utils";
import { normalizeTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get("tenantId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { ok: false, error: "startDate and endDate are required." },
        { status: 400 }
      );
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    if (requestedTenantId && requestedTenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant mismatch." }, { status: 403 });
    }

    const report = await generateProfitLoss(tenantId, new Date(startDate), new Date(endDate));
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("finance/reports profit-loss error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate report.",
        details: (error instanceof Error ? error.message : undefined) || "Unknown error",
      },
      { status: 500 }
    );
  }
}
