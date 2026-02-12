import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { LeaveService } from "@/lib/hr/leave";

export const runtime = "nodejs";

const querySchema = z.object({
  employeeId: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

function canManage(role?: string) {
  const normalized = (role || "").toLowerCase().replace(/-/g, "_");
  return normalized === "hr" || normalized === "admin" || normalized === "super_admin";
}

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      await requireModule(me.tenantId, "hr", { role: me.role });
    } catch (err) {
      if (isPlanAccessError(err)) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      return NextResponse.json({ ok: false, error: "Unable to validate module access" }, { status: 500 });
    }

    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const employeeId = query.employeeId && canManage(me.role) ? query.employeeId : me.uid;
    const year = query.year || new Date().getUTCFullYear();

    const balances = await LeaveService.getBalances(me.tenantId, employeeId, year);
    return NextResponse.json({ ok: true, balances, employeeId, year });
  } catch (err) {
    console.error("HR leave balance error", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch leave balances" }, { status: 400 });
  }
}
