import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { TaskService } from "@/lib/projects/task-service";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { Task } from "@/types/project-management";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";
import { dispatchZapierTriggerEvent } from "@/lib/zapier/service";

const updateTaskStatusSchema = z.object({
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "completed", "cancelled"]),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    const body = await request.json();
    const validated = updateTaskStatusSchema.safeParse(body);
    if (!validated.success) {
      throw new AppError({ message: "Task status is invalid.", code: "VALIDATION_ERROR", status: 400, details: validated.error.flatten() });
    }

    const taskDoc = await adminDb.collection("tasks").doc(params.taskId).get();
    if (!taskDoc.exists) {
      throw new AppError({ message: "Task not found", code: "NOT_FOUND", status: 404 });
    }

    const task = taskDoc.data() as Task;
    if (task.tenantId !== me.tenantId || task.projectId !== params.id) {
      throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
    }

    await TaskService.updateTaskStatus({
      taskId: params.taskId,
      status: validated.data.status,
      userId: me.uid,
      userName: me.name || me.fullName || "",
    });

    if (validated.data.status === "completed") {
      try {
        await dispatchZapierTriggerEvent({
          tenantId: me.tenantId,
          eventName: "task.completed",
          entityType: "task",
          entityId: params.taskId,
          payload: {
            projectId: params.id,
            taskId: params.taskId,
            status: validated.data.status,
          },
          actor: { uid: me.uid, email: me.email || null, role: me.role || null },
        });
      } catch (error) {
        logError(error, { route: "PATCH /api/projects/[id]/tasks/[taskId]/status", action: "zapier-dispatch" });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: "PATCH /api/projects/[id]/tasks/[taskId]/status" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to update task status.",
      context: { module: "projects", operation: "update-task-status" },
    });
    return NextResponse.json(body, { status, headers });
  }
}
