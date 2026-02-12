import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAutomationAdmin } from "../../../../_utils";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const runsSnap = await adminDb
    .collection("automation_workflow_runs")
    .where("tenantId", "==", auth.user.tenantId)
    .where("workflowId", "==", params.id)
    .orderBy("startedAt", "desc")
    .limit(50)
    .get();

  const runs = await Promise.all(
    runsSnap.docs.map(async (doc) => {
      const logsSnap = await doc.ref.collection("logs").orderBy("ts", "asc").get();
      return {
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
        logs: logsSnap.docs.map((log) => log.data()),
      };
    })
  );

  return NextResponse.json({ ok: true, runs });
}
