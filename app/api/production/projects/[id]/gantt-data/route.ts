import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
}

function daysBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((end - start) / dayMs));
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const projectDoc = await adminDb.collection("projects").doc(params.id).get();
    if (!projectDoc.exists) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

    const project = projectDoc.data() as { tenantId?: string; name?: string };
    if (project.tenantId !== me.tenantId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const [tasksSnap, depsSnap, milestonesSnap] = await Promise.all([
      adminDb.collection("tasks").where("tenantId", "==", me.tenantId).where("projectId", "==", params.id).get(),
      adminDb.collection("taskDependencies").where("tenantId", "==", me.tenantId).where("projectId", "==", params.id).get(),
      adminDb.collection("milestones").where("tenantId", "==", me.tenantId).where("projectId", "==", params.id).get(),
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
        durationDays: data.estimatedHours ? Math.max(1, Math.ceil(Number(data.estimatedHours) / 8)) : daysBetween(startDate, endDate),
        milestone: Boolean(data.milestoneId),
        constraintType: (data.constraintType || "asap") as string,
        constraintDate: asIso(data.constraintDate),
        assignedResources: Array.isArray(data.assignedResources)
          ? data.assignedResources
          : data.assignedTo
            ? [{ resourceId: data.assignedTo, resourceName: data.assignedToName || "Unassigned", allocationPercent: 100 }]
            : [],
        status: data.status || "todo",
        progress: Number(data.progress || 0),
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

    const milestones = milestonesSnap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        name: data.name || "Milestone",
        dueDate: asIso(data.dueDate),
        status: data.status || "upcoming",
        progress: Number(data.progress || 0),
      };
    });

    return NextResponse.json({
      ok: true,
      project: { id: params.id, name: project.name || "Project" },
      tasks,
      dependencies,
      milestones,
    });
  } catch (error) {
    console.error("GET /api/production/projects/[id]/gantt-data", error);
    return NextResponse.json({ ok: false, error: "Unable to load gantt data." }, { status: 500 });
  }
}
