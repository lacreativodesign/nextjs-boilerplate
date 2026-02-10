import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { TaskService } from "@/lib/projects/task-service";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { Task } from "@/types/project-management";

const updateTaskStatusSchema = z.object({
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "completed", "cancelled"]),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { status } = updateTaskStatusSchema.parse(body);

    const taskDoc = await adminDb.collection("tasks").doc(params.taskId).get();
    if (!taskDoc.exists) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const task = taskDoc.data() as Task;
    if (task.tenantId !== me.tenantId || task.projectId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await TaskService.updateTaskStatus({
      taskId: params.taskId,
      status,
      userId: me.uid,
      userName: me.name || me.fullName || "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating task status:", error);
    return NextResponse.json({ error: "Failed to update task status" }, { status: 500 });
  }
}
