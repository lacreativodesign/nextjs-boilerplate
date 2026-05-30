import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/tenant/server";
import { cookies } from "next/headers";
import { getAgentTask } from "@/lib/ai/agent-task";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "super_admin", "finance"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getCurrentUser(cookies());
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const taskId = String(params?.taskId || "").trim();
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "taskId is required" }, { status: 400 });
    }

    const task = await getAgentTask(taskId);

    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    // Tenant isolation — can only read your own tasks
    if (task.tenantId !== user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, task });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Server error" }, { status: 500 });
  }
}
