import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAutomationAdmin } from "../../../_utils";

export const runtime = "nodejs";

type ApprovalStepDoc = {
  id: string;
  approvers?: string[];
  status?: "pending" | "approved" | "rejected";
  respondedBy?: string;
  respondedAt?: string;
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await request.json();
  const decision = body?.decision === "reject" ? "reject" : "approve";
  const note = String(body?.note || "");

  const approvalRef = adminDb.collection("automation_approvals").doc(params.id);
  const snap = await approvalRef.get();
  if (!snap.exists || snap.data()?.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: "Approval request not found." }, { status: 404 });
  }

  const data = snap.data() || {};
  if (data.status !== "pending") {
    return NextResponse.json({ ok: false, error: "Approval request already resolved." }, { status: 400 });
  }

  const steps = (Array.isArray(data.steps) ? data.steps : []) as ApprovalStepDoc[];
  const mode = data.mode === "parallel" ? "parallel" : "sequential";
  const currentStepIndex = Number.isInteger(data.currentStepIndex) ? Number(data.currentStepIndex) : 0;

  const writableIndexes = mode === "parallel" ? steps.map((_, index) => index) : [currentStepIndex];

  let touched = false;
  const nextSteps = steps.map((step, index) => {
    if (!writableIndexes.includes(index) || touched) return step;
    if (step.status && step.status !== "pending") return step;
    if (Array.isArray(step.approvers) && !step.approvers.includes(auth.user.uid)) return step;

    touched = true;
    return {
      ...step,
      status: decision === "approve" ? "approved" : "rejected",
      respondedBy: auth.user.uid,
      respondedAt: new Date().toISOString(),
      note,
    };
  });

  if (!touched) {
    return NextResponse.json({ ok: false, error: "User is not assigned to this approval step." }, { status: 403 });
  }

  const hasReject = nextSteps.some((step) => step.status === "rejected");
  const allApproved = nextSteps.every((step) => step.status === "approved");
  const nextIndex = mode === "sequential" ? Math.min(currentStepIndex + 1, nextSteps.length - 1) : currentStepIndex;

  const finalStatus = hasReject ? "rejected" : allApproved ? "approved" : "pending";

  await approvalRef.set(
    {
      steps: nextSteps,
      status: finalStatus,
      currentStepIndex: finalStatus === "pending" ? nextIndex : currentStepIndex,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  if (finalStatus !== "pending") {
    await adminDb
      .collection("automation_workflow_runs")
      .doc(String(data.runId || ""))
      .set(
        {
          status: finalStatus === "approved" ? "success" : "failed",
          completedAt: new Date().toISOString(),
          error: finalStatus === "approved" ? null : "Approval rejected",
        },
        { merge: true }
      );
  }

  return NextResponse.json({ ok: true, status: finalStatus });
}
