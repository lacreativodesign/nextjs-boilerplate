import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { LeaveService } from "@/lib/hr/leave";

export const runtime = "nodejs";

export async function PUT(_: NextRequest, { params }: { params: { id: string } }) {
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

    await LeaveService.approveRequest({
      tenantId: me.tenantId,
      requestId: params.id,
      actorUserId: me.uid,
      actorRole: me.role,
      actorName: me.name || me.fullName || me.email || me.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HR leave approve error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to approve leave request" }, { status: 400 });
  }
}
