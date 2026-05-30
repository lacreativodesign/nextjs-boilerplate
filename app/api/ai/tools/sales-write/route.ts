import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/tenant/server";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebaseAdmin";
import { writeAuditLog } from "@/lib/tenant/audit";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "super_admin", "sales_manager", "sales"]);
const VALID_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser({ cookies: cookies() } as Parameters<typeof getCurrentUser>[0]);
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, taskId, actionId, input } = body;

    if (!action || !taskId || !actionId) {
      return NextResponse.json({ ok: false, error: "action, taskId, actionId required" }, { status: 400 });
    }

    if (action === "update_lead_status") {
      const leadId = String(input?.leadId || "").trim();
      const stage = String(input?.stage || "").trim();
      const notes = input?.notes ? String(input.notes) : null;

      if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
      if (!VALID_STAGES.includes(stage)) {
        return NextResponse.json({ ok: false, error: `Invalid stage: ${stage}` }, { status: 400 });
      }

      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

      const lead = leadSnap.data() || {};
      if (lead.tenantId !== user.tenantId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      const previousStage = lead.stage || "New";

      await adminDb.collection("leads").doc(leadId).set(
        {
          stage,
          updatedAt: new Date().toISOString(),
          ...(notes ? { aiNotes: notes } : {}),
        },
        { merge: true }
      );

      await writeAuditLog({
        tenantId: user.tenantId,
        actorUserId: user.uid,
        actorName: user.fullName || user.email,
        actorRole: user.role,
        actionType: "ai.sales.update_lead_status",
        entityType: "lead",
        entityId: leadId,
        metadata: {
          taskId, actionId,
          previousStage, newStage: stage,
          notes,
          leadName: lead.name || "",
        },
      });

      const taskSnap = await adminDb.collection("agent_tasks").doc(taskId).get();
      if (taskSnap.exists) {
        const taskData = taskSnap.data() || {};
        const actions = (taskData.proposedActions || []).map((a: unknown) =>
          (a as Record<string, unknown>).id === actionId
            ? { ...(a as Record<string, unknown>), status: "executed", executedAt: new Date().toISOString() }
            : a
        );
        const allResolved = actions.every((a: unknown) => (a as Record<string, unknown>).status !== "pending");
        await adminDb.collection("agent_tasks").doc(taskId).set(
          { proposedActions: actions, ...(allResolved ? { status: "completed" } : {}) },
          { merge: true }
        );
      }

      return NextResponse.json({ ok: true, updated: true, leadId, stage });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[SALES_WRITE]", err);
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Server error" }, { status: 500 });
  }
}
