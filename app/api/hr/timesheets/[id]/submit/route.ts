import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { requireModule, isPlanAccessError } from "@/app/lib/plan-enforcement";
import { TimeTrackingService } from "@/lib/hr/time-tracking";

export const runtime = "nodejs";

export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const timesheet = await TimeTrackingService.submitTimesheet({
      timesheetId: id,
      tenantId: me.tenantId,
      requesterUserId: me.uid,
      requesterRole: me.role,
    });

    return NextResponse.json({ ok: true, timesheet });
  } catch (err) {
    console.error("HR submit timesheet error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to submit timesheet" }, { status: 400 });
  }
}
