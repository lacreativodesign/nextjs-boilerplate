import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TaskService } from "@/lib/projects/task-service";
import { getCurrentUser } from "@/app/api/admin/_utils";

const startSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  taskId: z.string().min(1),
  taskTitle: z.string().min(1),
  billable: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = startSchema.parse(await request.json());

    const entryId = await TaskService.startTimer({
      tenantId: me.tenantId,
      projectId: payload.projectId,
      projectName: payload.projectName,
      taskId: payload.taskId,
      taskTitle: payload.taskTitle,
      userId: me.uid,
      userName: me.name || me.fullName || "",
      billable: payload.billable,
    });

    return NextResponse.json({ entryId });
  } catch (error) {
    console.error("Error starting timer:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start timer" }, { status: 500 });
  }
}
