import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { calculateCriticalPath } from "@/lib/production/critical-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const projectDoc = await adminDb.collection("projects").doc(params.id).get();
    if (!projectDoc.exists) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

    const project = projectDoc.data() as { tenantId?: string };
    if (project.tenantId !== me.tenantId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const [tasksSnap, depsSnap] = await Promise.all([
      adminDb.collection("tasks").where("tenantId", "==", me.tenantId).where("projectId", "==", params.id).get(),
      adminDb.collection("taskDependencies").where("tenantId", "==", me.tenantId).where("projectId", "==", params.id).get(),
    ]);

    const tasks = tasksSnap.docs.map((doc) => {
      const data = doc.data() as any;
      const startDate = asIso(data.startDate) || asIso(data.createdAt) || new Date().toISOString();
      const endDate = asIso(data.dueDate) || startDate;
      return {
        id: doc.id,
        tenantId: me.tenantId,
        projectId: params.id,
        title: data.title || "Untitled task",
        startDate,
        endDate,
        durationDays: data.estimatedHours ? Math.max(1, Math.ceil(Number(data.estimatedHours) / 8)) : 1,
        milestone: Boolean(data.milestoneId),
        constraintType: data.constraintType || "asap",
        constraintDate: asIso(data.constraintDate),
        assignedResources: Array.isArray(data.assignedResources)
          ? data.assignedResources
          : data.assignedTo
            ? [{ resourceId: data.assignedTo, resourceName: data.assignedToName || "Unassigned", allocationPercent: 100 }]
            : [],
      };
    });

    const dependencies = depsSnap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        tenantId: me.tenantId,
        projectId: params.id,
        predecessorTaskId: data.predecessorTaskId,
        successorTaskId: data.successorTaskId,
        type: data.type || "finish_to_start",
        lagDays: Number(data.lagDays || 0),
      };
    });

    const criticalPath = calculateCriticalPath(tasks, dependencies);
    return NextResponse.json({ ok: true, ...criticalPath });
  } catch (error) {
    console.error("GET /api/production/projects/[id]/critical-path", error);
    return NextResponse.json({ ok: false, error: "Unable to calculate critical path." }, { status: 500 });
  }
}
