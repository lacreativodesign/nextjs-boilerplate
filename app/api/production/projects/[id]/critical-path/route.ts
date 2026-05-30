import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { calculateCriticalPath } from "@/lib/production/critical-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
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
      const data = doc.data() as unknown;
      const startDate = asIso((data as Record<string, unknown>).startDate) || asIso((data as Record<string, unknown>).createdAt) || new Date().toISOString();
      const endDate = asIso((data as Record<string, unknown>).dueDate) || startDate;
      return {
        id: doc.id,
        tenantId: me.tenantId,
        projectId: params.id,
        title: (data as Record<string, unknown>).title || "Untitled task",
        startDate,
        endDate,
        durationDays: (data as Record<string, unknown>).estimatedHours ? Math.max(1, Math.ceil(Number((data as Record<string, unknown>).estimatedHours) / 8)) : 1,
        milestone: Boolean((data as Record<string, unknown>).milestoneId),
        constraintType: (data as Record<string, unknown>).constraintType || "asap",
        constraintDate: asIso((data as Record<string, unknown>).constraintDate),
        assignedResources: Array.isArray((data as Record<string, unknown>).assignedResources)
          ? (data as Record<string, unknown>).assignedResources
          : (data as Record<string, unknown>).assignedTo
            ? [{ resourceId: (data as Record<string, unknown>).assignedTo, resourceName: (data as Record<string, unknown>).assignedToName || "Unassigned", allocationPercent: 100 }]
            : [],
      };
    });

    const dependencies = depsSnap.docs.map((doc) => {
      const data = doc.data() as unknown;
      return {
        id: doc.id,
        tenantId: me.tenantId,
        projectId: params.id,
        predecessorTaskId: (data as Record<string, unknown>).predecessorTaskId,
        successorTaskId: (data as Record<string, unknown>).successorTaskId,
        type: (data as Record<string, unknown>).type || "finish_to_start",
        lagDays: Number((data as Record<string, unknown>).lagDays || 0),
      };
    });

    const criticalPath = calculateCriticalPath(tasks, dependencies);
    return NextResponse.json({ ok: true, ...criticalPath });
  } catch (error) {
    console.error("GET /api/production/projects/[id]/critical-path", error);
    return NextResponse.json({ ok: false, error: "Unable to calculate critical path." }, { status: 500 });
  }
}
