import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/tenant/server";
import { cookies } from "next/headers";
import {
  createAgentTask,
  listAgentTasks,
  type AgentType,
} from "@/lib/ai/agent-task";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "super_admin", "finance"]);
const ALLOWED_AGENT_TYPES = new Set<AgentType>(["coo", "finance", "sales"]);

export async function GET() {
  try {
    const user = await getCurrentUser({ cookies: cookies() });
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await listAgentTasks(user.tenantId!, 50);
    return NextResponse.json({ ok: true, tasks });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser({ cookies: cookies() });
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { agentType, prompt } = body;

    if (!agentType || !ALLOWED_AGENT_TYPES.has(agentType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid agentType. Must be: coo, finance, or sales." },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return NextResponse.json(
        { ok: false, error: "prompt is required." },
        { status: 400 }
      );
    }

    const task = await createAgentTask({
      tenantId: user.tenantId!,
      agentType: agentType as AgentType,
      prompt: prompt.trim(),
      createdBy: user.uid,
    });

    return NextResponse.json({ ok: true, task });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
