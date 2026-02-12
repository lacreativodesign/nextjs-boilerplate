import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { LeaveService } from "@/lib/hr/leave";

export const runtime = "nodejs";

const schema = z.object({
  reason: z.string().min(2).max(1000),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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

    await LeaveService.rejectRequest({
      tenantId: me.tenantId,
      requestId: params.id,
      actorUserId: me.uid,
      actorRole: me.role,
      actorName: me.name || me.fullName || me.email || me.uid,
      reason: payload.reason,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HR leave reject error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to reject leave request" }, { status: 400 });
  }
}
