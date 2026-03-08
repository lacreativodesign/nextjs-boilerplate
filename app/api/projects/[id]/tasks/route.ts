import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { TaskService } from "@/lib/projects/task-service";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { Project } from "@/types/project-management";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";
import { executeMonitoredQuery, getPageSize } from "@/lib/firestore/query-performance";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assignedTo: z.string().optional(),
  assignedToName: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  milestoneId: z.string().optional(),
  parentTaskId: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    const body = await request.json();
    const validated = createTaskSchema.safeParse(body);
    if (!validated.success) {
      throw new AppError({ message: "Task details are invalid.", code: "VALIDATION_ERROR", status: 400, details: validated.error.flatten() });
    }

    const projectDoc = await adminDb.collection("projects").doc(params.id).get();
    if (!projectDoc.exists) {
      throw new AppError({ message: "Project not found", code: "NOT_FOUND", status: 404 });
    }

    const project = projectDoc.data() as Project;
    if (project.tenantId !== me.tenantId) {
      throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
    }

    const taskId = await TaskService.createTask({
      tenantId: me.tenantId,
      projectId: params.id,
      projectName: project.name,
      title: validated.data.title,
      description: validated.data.description,
      priority: validated.data.priority,
      assignedTo: validated.data.assignedTo,
      assignedToName: validated.data.assignedToName,
      assignedBy: me.uid,
      assignedByName: me.name || me.fullName || "",
      dueDate: validated.data.dueDate ? new Date(validated.data.dueDate) : undefined,
      estimatedHours: validated.data.estimatedHours,
      milestoneId: validated.data.milestoneId,
      parentTaskId: validated.data.parentTaskId,
    });

    return NextResponse.json({ taskId });
  } catch (error) {
    logError(error, { route: "POST /api/projects/[id]/tasks" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to create task.",
      context: { module: "projects", operation: "create-task" },
    });
    return NextResponse.json(body, { status, headers });
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");
    const cursor = searchParams.get("cursor");
    const pageSize = getPageSize(searchParams.get("limit"));

    let query: FirebaseFirestore.Query = adminDb
      .collection("tasks")
      .where("tenantId", "==", me.tenantId)
      .where("projectId", "==", params.id);

    if (status && status !== "all") query = query.where("status", "==", status);
    if (assignedTo) query = query.where("assignedTo", "==", assignedTo);

    query = query.orderBy("createdAt", "desc").limit(pageSize);

    if (cursor) {
      const cursorDoc = await adminDb.collection("tasks").doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await executeMonitoredQuery(() => query.get(), {
      route: "GET /api/projects/[id]/tasks",
      tenantId: me.tenantId,
      queryName: "project_tasks_list",
      metadata: { projectId: params.id, status, assignedTo, limit: pageSize, cursor: cursor || null },
    });
    const tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      tasks,
      pagination: {
        limit: pageSize,
        nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null,
      },
    });
  } catch (error) {
    logError(error, { route: "GET /api/projects/[id]/tasks" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to load tasks.",
      context: { module: "projects", operation: "list-tasks" },
    });
    return NextResponse.json(body, { status, headers });
  }
}
