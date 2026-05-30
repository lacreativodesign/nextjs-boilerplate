import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { requireModule, isPlanAccessError } from "@/app/lib/plan-enforcement";
import { TimeTrackingService } from "@/lib/hr/time-tracking";

export const runtime = "nodejs";


function canManageAll(role?: string) {
  const normalized = (role || "").toLowerCase().replace(/-/g, "_");
  return normalized === "admin" || normalized === "super_admin" || normalized === "hr";
}

const querySchema = z.object({
  periodType: z.enum(["weekly", "bi_weekly", "monthly"]).default("weekly"),
  userId: z.string().optional(),
  userName: z.string().optional(),
  date: z.string().datetime().optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
  mode: z.enum(["generate", "list"]).default("generate"),
});

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      await requireModule(me.tenantId as string, "hr", { role: me.role });
    } catch (err) {
      if (isPlanAccessError(err)) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      return NextResponse.json({ ok: false, error: "Unable to validate module access" }, { status: 500 });
    }

    const parsed = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));

    if (parsed.mode === "list") {
      const timesheets = await TimeTrackingService.listTimesheets({
        tenantId: me.tenantId,
        requesterUserId: me.uid,
        requesterRole: me.role,
        userId: parsed.userId,
        status: parsed.status,
      });
      return NextResponse.json({ ok: true, timesheets });
    }

    if (parsed.userId && parsed.userId !== me.uid && !canManageAll(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const timesheet = await TimeTrackingService.generateTimesheet({
      tenantId: me.tenantId,
      userId: parsed.userId || me.uid,
      userName: parsed.userName || me.name || me.fullName || me.email || me.uid,
      periodType: parsed.periodType,
      anchorDate: parsed.date ? new Date(parsed.date) : undefined,
    });

    return NextResponse.json({ ok: true, timesheet });
  } catch (err) {
    console.error("HR timesheets error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to process timesheet request" }, { status: 400 });
  }
}
