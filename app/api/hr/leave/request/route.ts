import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { LeaveService } from "@/lib/hr/leave";

export const runtime = "nodejs";

const schema = z.object({
  leaveType: z.enum(["vacation", "sick", "personal", "unpaid", "bereavement"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(1000).optional().nullable(),
});

export async function POST(request: NextRequest) {
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

    const payload = schema.parse(await request.json());

    const leaveRequest = await LeaveService.submitLeaveRequest({
      tenantId: me.tenantId,
      employeeId: me.uid,
      employeeName: me.name || me.fullName || me.email || me.uid,
      leaveType: payload.leaveType,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      reason: payload.reason || null,
    });

    return NextResponse.json({ ok: true, requestId: leaveRequest.id });
  } catch (err) {
    console.error("HR leave request error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to submit leave request" }, { status: 400 });
  }
}
