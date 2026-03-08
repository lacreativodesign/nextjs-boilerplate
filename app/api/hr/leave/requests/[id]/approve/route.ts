import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { LeaveService } from "@/lib/hr/leave";
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";

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

    try {
      await dispatchWebhookEvent({
        tenantId: me.tenantId,
        event: "leave.approved",
        entityType: "leave",
        entityId: params.id,
        payload: {
          requestId: params.id,
          approvedBy: me.uid,
        },
        actor: { uid: me.uid, email: me.email || null, role: me.role || null },
      });
    } catch (webhookError) {
      console.error("leave.approved webhook dispatch error:", webhookError);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HR leave approve error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to approve leave request" }, { status: 400 });
  }
}
