import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/tenant/server";
import { cookies } from "next/headers";
import {
  getAgentTask,
  getTenantAIKey,
  markTaskCompleted,
  markTaskFailed,
  markTaskProcessing,
  type AgentToolCall,
} from "@/lib/ai/agent-task";
import {
  getReadOnlyTools,
  toAnthropicTools,
  toOpenAITools,
  validateToolCall,
} from "@/lib/ai/tool-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 55; // Vercel max for hobby/pro

const ALLOWED_ROLES = new Set(["admin", "super_admin"]);
const MAX_TOOL_ITERATIONS = 8;

const COO_SYSTEM_PROMPT = `You are the Bizosto COO Agent — a read-only AI business analyst.
Your job is to produce a clear, concise daily business summary for the workspace admin.

Use the available tools to gather real data. After gathering data, produce a well-structured summary covering:
1. Business health at a glance (revenue, team, pipeline)
2. What needs attention today (overdue invoices, stalled leads, at-risk projects)
3. One or two actionable recommendations

Rules:
- Only report data returned by tools. Never invent numbers.
- Be direct and specific — dollar amounts, counts, names.
- Keep the summary under 300 words.
- Use plain English, no jargon.`;

export async function POST(
  _req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getCurrentUser({ cookies: cookies() } as Parameters<typeof getCurrentUser>[0]);
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const taskId = String(params?.taskId || "").trim();
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "taskId required" }, { status: 400 });
    }

    const task = await getAgentTask(taskId);
    if (!task) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    if (task.tenantId !== user.tenantId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (task.status !== "queued") return NextResponse.json({ ok: false, error: `Task is already ${task.status}` }, { status: 409 });

    // Get tenant's BYOK API key
    const keyConfig = await getTenantAIKey(user.tenantId);
    if (!keyConfig) {
      await markTaskFailed(taskId, "No AI API key configured. Go to Settings → AI Workforce to add your key.");
      return NextResponse.json({ ok: false, error: "No AI API key configured" }, { status: 422 });
    }

    await markTaskProcessing(taskId);

    const tools = getReadOnlyTools();
    const toolCalls: AgentToolCall[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      let result: string;

      if (keyConfig.provider === "anthropic") {
        result = await runAnthropicAgent(keyConfig.apiKey, task.prompt, user.tenantId, tools, toolCalls, (i, o) => { inputTokens += i; outputTokens += o; });
      } else {
        result = await runOpenAIAgent(keyConfig.apiKey, task.prompt, user.tenantId, tools, toolCalls, (i, o) => { inputTokens += i; outputTokens += o; });
      }

      await markTaskCompleted(taskId, result, toolCalls, { inputTokens, outputTokens }, keyConfig.provider);
      return NextResponse.json({ ok: true, taskId, status: "completed" });

    } catch (execErr) {
      await markTaskFailed(taskId, (execErr instanceof Error ? execErr.message : undefined) || "Agent execution failed");
      return NextResponse.json({ ok: false, error: (execErr instanceof Error ? execErr.message : undefined) || "Execution failed" }, { status: 500 });
    }

  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Server error" }, { status: 500 });
  }
}

// ─── Anthropic Agentic Loop ───────────────────────────────────────────────────

async function runAnthropicAgent(
  apiKey: string,
  prompt: string,
  tenantId: string,
  tools: ReturnType<typeof getReadOnlyTools>,
  toolCalls: AgentToolCall[],
  trackTokens: (input: number, output: number) => void
): Promise<string> {
  const anthropicTools = toAnthropicTools(tools);
  const messages: unknown[] = [{ role: "user", content: prompt }];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        system: COO_SYSTEM_PROMPT,
        tools: anthropicTools,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    trackTokens(data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: data.content });

    if (data.stop_reason === "end_turn") {
      const textBlock = data.content.find((b: unknown) => (b as Record<string, unknown>).type === "text");
      if (textBlock?.text) return textBlock.text;
      throw new Error("No text response from assistant");
    }

    if (data.stop_reason === "tool_use") {
      const toolUseBlocks = data.content.filter((b: unknown) => (b as Record<string, unknown>).type === "tool_use");
      const toolResults: unknown[] = [];

      for (const block of toolUseBlocks) {
        const validation = validateToolCall(block.name, "coo", "pro");
        let toolOutput: unknown;

        if (!validation.valid) {
          toolOutput = { error: validation.error };
        } else {
          toolOutput = await executeToolCall(block.name, tenantId, block.input || {});
          toolCalls.push({
            toolName: block.name,
            input: block.input || {},
            output: toolOutput,
            executedAt: new Date().toISOString(),
          });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(toolOutput),
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${data.stop_reason}`);
  }

  throw new Error("Agent exceeded maximum tool iterations");
}

// ─── OpenAI Agentic Loop ──────────────────────────────────────────────────────

async function runOpenAIAgent(
  apiKey: string,
  prompt: string,
  tenantId: string,
  tools: ReturnType<typeof getReadOnlyTools>,
  toolCalls: AgentToolCall[],
  trackTokens: (input: number, output: number) => void
): Promise<string> {
  const openaiTools = toOpenAITools(tools);
  const messages: unknown[] = [
    { role: "system", content: COO_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2048,
        tools: openaiTools,
        tool_choice: "auto",
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    trackTokens(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0);

    const choice = data.choices?.[0];
    const message = choice?.message;
    messages.push(message);

    if (choice?.finish_reason === "stop") {
      return message?.content || "";
    }

    if (choice?.finish_reason === "tool_calls") {
      for (const tc of message?.tool_calls || []) {
        const toolName = tc.function?.name;
        const toolInput = JSON.parse(tc.function?.arguments || "{}");

        const validation = validateToolCall(toolName, "coo", "pro");
        let toolOutput: unknown;

        if (!validation.valid) {
          toolOutput = { error: validation.error };
        } else {
          toolOutput = await executeToolCall(toolName, tenantId, toolInput);
          toolCalls.push({
            toolName,
            input: toolInput,
            output: toolOutput,
            executedAt: new Date().toISOString(),
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolOutput),
        });
      }
      continue;
    }

    throw new Error(`Unexpected finish_reason: ${choice?.finish_reason}`);
  }

  throw new Error("Agent exceeded maximum tool iterations");
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  tenantId: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.bizosto.com";
  const res = await fetch(`${baseUrl}/api/ai/tools/read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_REQUEST_SIGNING_SECRET || "",
    },
    body: JSON.stringify({ tool: toolName, tenantId, input }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json?.error || `Tool ${toolName} failed`);
  }
  return json.result;
}
