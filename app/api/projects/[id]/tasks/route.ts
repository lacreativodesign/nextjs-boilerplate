import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { TaskService } from "@/lib/projects/task-service";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { Project } from "@/types/project-management";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createTaskSchema.parse(body);

    const projectDoc = await adminDb.collection("projects").doc(params.id).get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = projectDoc.data() as Project;
    if (project.tenantId !== me.tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const taskId = await TaskService.createTask({
      tenantId: me.tenantId,
      projectId: params.id,
      projectName: project.name,
      title: data.title,
      description: data.description,
      priority: data.priority,
      assignedTo: data.assignedTo,
      assignedToName: data.assignedToName,
      assignedBy: me.uid,
      assignedByName: me.name || me.fullName || "",
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      estimatedHours: data.estimatedHours,
      milestoneId: data.milestoneId,
      parentTaskId: data.parentTaskId,
    });

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    let query: FirebaseFirestore.Query = adminDb
      .collection("tasks")
      .where("tenantId", "==", me.tenantId)
      .where("projectId", "==", params.id);

    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    if (assignedTo) {
      query = query.where("assignedTo", "==", assignedTo);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    const tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
