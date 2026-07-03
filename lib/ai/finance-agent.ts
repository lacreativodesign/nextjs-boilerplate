/**
 * BIZOSTO FINANCE AGENT — Phase 2
 * Reads financial data, surfaces overdue invoices, proposes
 * payment reminder actions for human approval before sending.
 */

import {
  getAgentTask,
  getTenantAIKey,
  markTaskCompleted,
  markTaskFailed,
  markTaskProcessing,
  updateAgentTask,
  type AgentTask,
  type AgentToolCall,
} from '@/lib/ai/agent-task';
import {
  toAnthropicTools,
  toOpenAITools,
  validateToolCall,
  TOOL_REGISTRY,
  type AgentTool,
} from '@/lib/ai/tool-registry';

export type ProposedAction = {
  id: string;
  toolName: string;
  label: string;
  description: string;
  input: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  executedAt?: string;
  error?: string;
};

type JsonObject = Record<string, unknown>;

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input?: JsonObject };

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type OpenAIToolCall = {
  id: string;
  function?: { name?: string; arguments?: string };
};

type OpenAIMessage = {
  role: 'assistant';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIResponse = {
  choices?: { finish_reason?: string; message?: OpenAIMessage }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const MAX_ITERATIONS = 10;

const FINANCE_SYSTEM_PROMPT = `You are the Bizosto Finance Agent — a read-and-recommend AI analyst for service business finance.

Your job:
1. Use the available tools to gather financial data — specifically overdue invoices, revenue summary, and business overview.
2. Produce a clear, concise financial health summary covering: cash flow status, overdue collections, revenue trend, and what needs immediate attention.
3. Propose specific payment reminder actions for the most urgent overdue invoices by calling the send_payment_reminder tool.

Rules:
- Only report numbers returned by tools. Never invent amounts, names, or dates.
- Propose payment reminders ONLY for invoices that are genuinely overdue (past due date, unpaid).
- Keep your summary under 250 words.
- Be direct: dollar amounts, client names, days overdue.
- After your analysis, call send_payment_reminder for each overdue invoice that warrants a reminder (maximum 3).
- The human will review and approve or reject each reminder before it is sent.`;

function makeProposedActionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildFinanceTools(): AgentTool[] {
  const readTools = TOOL_REGISTRY.filter(
    (t) =>
      t.access === 'read_only' &&
      ['coo', 'admin', 'finance'].some((a) => t.allowedAgents.includes(a)),
  );
  const writeTools = TOOL_REGISTRY.filter(
    (t) => t.access === 'write' && t.allowedAgents.includes('finance'),
  );
  return [...readTools, ...writeTools];
}

function validateFinanceToolCall(
  toolName: string,
  tools: AgentTool[],
): { tool?: AgentTool; error?: string } {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) return { error: `Tool ${toolName} is not available to the finance agent` };

  if (tool.access === 'write') {
    const validation = validateToolCall(toolName, 'finance', 'pro');
    if (!validation.valid)
      return { error: validation.error || `Tool ${toolName} is not permitted` };
  }

  return { tool };
}

function parseToolArguments(args: string | undefined): JsonObject {
  if (!args) return {};
  const parsed: unknown = JSON.parse(args);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as JsonObject)
    : {};
}

export async function runFinanceAgent(taskId: string, tenantId: string): Promise<void> {
  const task = await getAgentTask(taskId);
  if (!task) throw new Error('Task not found');

  const keyConfig = await getTenantAIKey(tenantId);
  if (!keyConfig) {
    await markTaskFailed(
      taskId,
      'No AI API key configured. Go to Settings → AI Workforce to add your key.',
    );
    return;
  }

  await markTaskProcessing(taskId);

  const tools = buildFinanceTools();
  const toolCalls: AgentToolCall[] = [];
  const proposedActions: ProposedAction[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com';
    const internalSecret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || '';

    const executeReadTool = async (toolName: string, input: JsonObject): Promise<unknown> => {
      const res = await fetch(`${baseUrl}/api/ai/tools/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ tool: toolName, tenantId, input }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      const body =
        json && typeof json === 'object'
          ? (json as { ok?: boolean; error?: string; result?: unknown })
          : {};
      if (!res.ok || !body.ok) throw new Error(body.error || `Tool ${toolName} failed`);
      return body.result;
    };

    const interceptWriteTool = (toolName: string, input: JsonObject): unknown => {
      if (toolName === 'send_payment_reminder') {
        const invoiceId = String(input.invoiceId || '');
        const customMessage = input.message ? String(input.message) : undefined;
        const action: ProposedAction = {
          id: makeProposedActionId(),
          toolName,
          label: 'Send Payment Reminder',
          description: `Send a payment reminder email for invoice ${invoiceId}${customMessage ? ` — "${customMessage}"` : ''}`,
          input: { invoiceId, message: customMessage },
          status: 'pending',
        };
        proposedActions.push(action);
        return {
          queued: true,
          actionId: action.id,
          message: 'Payment reminder queued for human approval.',
        };
      }
      return { error: `Write tool ${toolName} not supported in this phase.` };
    };

    let result: string;

    if (keyConfig.provider === 'anthropic') {
      result = await runAnthropicFinanceLoop(
        keyConfig.apiKey,
        task.prompt,
        tools,
        toolCalls,
        executeReadTool,
        interceptWriteTool,
        (i, o) => {
          inputTokens += i;
          outputTokens += o;
        },
      );
    } else {
      result = await runOpenAIFinanceLoop(
        keyConfig.apiKey,
        task.prompt,
        tools,
        toolCalls,
        executeReadTool,
        interceptWriteTool,
        (i, o) => {
          inputTokens += i;
          outputTokens += o;
        },
      );
    }

    await markTaskCompleted(
      taskId,
      result,
      toolCalls,
      { inputTokens, outputTokens },
      keyConfig.provider,
    );

    if (proposedActions.length > 0) {
      await updateAgentTask(taskId, {
        proposedActions,
        status: 'awaiting_approval',
      } as Partial<AgentTask> & { proposedActions: ProposedAction[] });
    }
  } catch (err: unknown) {
    await markTaskFailed(
      taskId,
      err instanceof Error ? err.message : 'Finance agent execution failed',
    );
  }
}

async function runAnthropicFinanceLoop(
  apiKey: string,
  prompt: string,
  tools: AgentTool[],
  toolCalls: AgentToolCall[],
  executeRead: (name: string, input: JsonObject) => Promise<unknown>,
  interceptWrite: (name: string, input: JsonObject) => unknown,
  trackTokens: (i: number, o: number) => void,
): Promise<string> {
  const anthropicTools = toAnthropicTools(tools);
  const messages: unknown[] = [{ role: 'user', content: prompt }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: FINANCE_SYSTEM_PROMPT,
        tools: anthropicTools,
        messages,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${t.slice(0, 200)}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    trackTokens(data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      const textBlock = data.content.find(
        (b): b is { type: 'text'; text: string } => b.type === 'text',
      );
      if (textBlock?.text) return textBlock.text;
      throw new Error('No text response from finance agent');
    }

    if (data.stop_reason === 'tool_use') {
      const toolUseBlocks = data.content.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input?: JsonObject } =>
          b.type === 'tool_use',
      );
      const toolResults: unknown[] = [];

      for (const block of toolUseBlocks) {
        const validation = validateFinanceToolCall(block.name, tools);
        let toolOutput: unknown;

        if (validation.error || !validation.tool) {
          toolOutput = { error: validation.error };
        } else if (validation.tool.access === 'write') {
          toolOutput = interceptWrite(block.name, block.input || {});
        } else {
          toolOutput = await executeRead(block.name, block.input || {});
          toolCalls.push({
            toolName: block.name,
            input: block.input || {},
            output: toolOutput,
            executedAt: new Date().toISOString(),
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolOutput),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${data.stop_reason}`);
  }

  throw new Error('Finance agent exceeded maximum iterations');
}

async function runOpenAIFinanceLoop(
  apiKey: string,
  prompt: string,
  tools: AgentTool[],
  toolCalls: AgentToolCall[],
  executeRead: (name: string, input: JsonObject) => Promise<unknown>,
  interceptWrite: (name: string, input: JsonObject) => unknown,
  trackTokens: (i: number, o: number) => void,
): Promise<string> {
  const openaiTools = toOpenAITools(tools);
  const messages: unknown[] = [
    { role: 'system', content: FINANCE_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2048,
        tools: openaiTools,
        tool_choice: 'auto',
        messages,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${t.slice(0, 200)}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    trackTokens(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0);

    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error('No message response from finance agent');
    messages.push(message);

    if (choice?.finish_reason === 'stop') return message.content || '';

    if (choice?.finish_reason === 'tool_calls') {
      for (const tc of message.tool_calls || []) {
        const toolName = tc.function?.name || '';
        const toolInput = parseToolArguments(tc.function?.arguments);
        const validation = validateFinanceToolCall(toolName, tools);
        let toolOutput: unknown;

        if (validation.error || !validation.tool) {
          toolOutput = { error: validation.error };
        } else if (validation.tool.access === 'write') {
          toolOutput = interceptWrite(toolName, toolInput);
        } else {
          toolOutput = await executeRead(toolName, toolInput);
          toolCalls.push({
            toolName,
            input: toolInput,
            output: toolOutput,
            executedAt: new Date().toISOString(),
          });
        }

        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolOutput) });
      }
      continue;
    }

    throw new Error(`Unexpected finish_reason: ${choice?.finish_reason}`);
  }

  throw new Error('Finance agent exceeded maximum iterations');
}
