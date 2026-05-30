import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { WORKFLOW_TEMPLATES } from "@/lib/automation/workflow-templates";
import type { WorkflowDefinition } from "@/lib/automation/workflow-types";
import { requireAutomationAdmin } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeWorkflow(input: unknown, tenantId: string, actorUid: string): Omit<WorkflowDefinition, "id"> {
  return {
    tenantId,
    name: String((input as Record<string, unknown>)?.name || "").trim(),
    description: String((input as Record<string, unknown>)?.description || "").trim(),
    trigger: (input as Record<string, unknown>)?.trigger as WorkflowTrigger,
    conditions: Array.isArray((input as Record<string, unknown>)?.conditions) ? (input as Record<string, unknown>).conditions as WorkflowCondition[] : [],
    actions: Array.isArray((input as Record<string, unknown>)?.actions) ? (input as Record<string, unknown>).actions as WorkflowAction[] : [],
    status: (input as Record<string, unknown>)?.status === "active" ? "active" : "disabled",
    retryLimit: Number.isFinite(Number((input as Record<string, unknown>)?.retryLimit)) ? Math.max(0, Math.min(5, Number((input as Record<string, unknown>).retryLimit))) : 1,
    createdBy: actorUid,
    updatedBy: actorUid,
    templateKey: (input as Record<string, unknown>)?.templateKey ? String((input as Record<string, unknown>).templateKey) : undefined,
  };
}

export async function GET() {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const snap = await adminDb
    .collection("automation_workflows")
    .where("tenantId", "==", auth.user.tenantId)
    .orderBy("updatedAt", "desc")
    .get();

  const workflows = snap.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ ok: true, workflows, templates: Object.keys(WORKFLOW_TEMPLATES) });
}

export async function POST(request: Request) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const workflow = normalizeWorkflow(body, auth.user.tenantId, auth.user.uid);

    if (!workflow.name || !workflow.trigger || workflow.actions.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing required workflow fields." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const ref = adminDb.collection("automation_workflows").doc();
    await ref.set({ ...workflow, createdAt: now, updatedAt: now });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("automation/workflows POST error", error);
    return NextResponse.json({ ok: false, error: "Unable to create workflow." }, { status: 500 });
  }
}
