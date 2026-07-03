/**
 * BIZOSTO SALES AGENT — Phase 2
 * Reads pipeline data, surfaces stalling leads, proposes
 * stage updates for human approval before executing.
 */

import {
  getAgentTask,
  getTenantAIKey,
  markTaskCompleted,
  markTaskFailed,
  markTaskProcessing,
  updateAgentTask,
  type AgentToolCall,
} from '@/lib/ai/agent-task';
import {
  toAnthropicTools,
  toOpenAITools,
  validateToolCall,
  TOOL_REGISTRY,
} from '@/lib/ai/tool-registry';

export type SalesProposedAction = {
  id: string;
  toolName: string;
  label: string;
  description: string;
  input: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  executedAt?: string;
  error?: string;
};

const MAX_ITERATIONS = 10;

const SALES_SYSTEM_PROMPT = `You are the Bizosto Sales Agent — an AI sales pipeline analyst for service businesses.

Your job:
1. Use the available tools to review the full sales pipeline — open leads by stage, pipeline value, and overall business context.
2. Identify stalling leads: leads that have been in an early stage (New, Contacted) for more than 7 days without apparent progression. Calculate days open from the data returned by tools.
3. Produce a clear pipeline health summary covering: total open leads by stage, estimated pipeline value, how many leads are stalling, and what needs immediate attention from the sales team.
4. Propose specific lead stage updates for the most critical stalling opportunities by calling update_lead_status.

Rules:
- Only use data returned by tools. Never invent lead names, amounts, or dates.
- A lead is stalling if daysOpen > 7 and stage is New or Contacted, OR daysOpen > 14 for any stage.
- Propose a maximum of 3 stage updates.
- For each update, suggest moving the lead to "Qualified" if there is buying intent, or "Lost" if it has gone cold.
- Keep the summary under 250 words.
- Be specific: lead names, days open, current stage, recommended next action.
- The human will review and approve or reject each update before it is executed.`;

function makeActionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildSalesTools() {
  const readTools = TOOL_REGISTRY.filter(
    (t) =>
      t.access === 'read_only' &&
      ['coo', 'admin', 'sales'].some((a) => t.allowedAgents.includes(a)),
  );
  const writeTools = TOOL_REGISTRY.filter(
    (t) => t.access === 'write' && t.allowedAgents.includes('sales'),
  );
  return [...readTools, ...writeTools];
}

export async function runSalesAgent(taskId: string, tenantId: string): Promise<void> {
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

  const tools = buildSalesTools();
  const toolCalls: AgentToolCall[] = [];
  const proposedActions: SalesProposedAction[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com';
    const internalSecret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || '';

    const executeReadTool = async (
      toolName: string,
      input: Record<string, unknown>,
    ): Promise<unknown> => {
      const res = await fetch(`${baseUrl}/api/ai/tools/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({ tool: toolName, tenantId, input }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || `Tool ${toolName} failed`);
      return json.result;
    };

    const interceptWriteTool = (toolName: string, input: Record<string, unknown>): unknown => {
      if (toolName === 'update_lead_status') {
        const leadId = String(input.leadId || '');
        const stage = String(input.stage || '');
        const notes = input.notes ? String(input.notes) : undefined;

        const action: SalesProposedAction = {
          id: makeActionId(),
          toolName,
          label: 'Update Lead Stage',
          description: `Move lead ${leadId} to "${stage}"${notes ? ` — ${notes}` : ''}`,
          input: { leadId, stage, notes },
          status: 'pending',
        };
        proposedActions.push(action);
        return {
          queued: true,
          actionId: action.id,
          message: `Stage update for lead ${leadId} queued for human approval.`,
        };
      }
      if (toolName === 'create_lead') {
        const name = String(input.name || '');
        const email = String(input.email || '');
        const action: SalesProposedAction = {
          id: makeActionId(),
          toolName,
          label: 'Create Lead',
          description: `Create new lead: ${name} (${email})`,
          input,
          status: 'pending',
        };
        proposedActions.push(action);
        return {
          queued: true,
          actionId: action.id,
          message: `New lead creation for ${name} queued for human approval.`,
        };
      }
      return { error: `Write tool ${toolName} not supported in this phase.` };
    };

    let result: string;

    if (keyConfig.provider === 'anthropic') {
      result = await runAnthropicSalesLoop(
        keyConfig.apiKey,
        task.prompt,
        tools,
        toolCalls,
        proposedActions,
        executeReadTool,
        interceptWriteTool,
        (i, o) => {
          inputTokens += i;
          outputTokens += o;
        },
      );
    } else {
      result = await runOpenAISalesLoop(
        keyConfig.apiKey,
        task.prompt,
        tools,
        toolCalls,
        proposedActions,
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
      } as any);
    }
  } catch (err: any) {
    await markTaskFailed(taskId, err?.message || 'Sales agent execution failed');
  }
}

async function runAnthropicSalesLoop(
  apiKey: string,
  prompt: string,
  tools: typeof TOOL_REGISTRY,
  toolCalls: AgentToolCall[],
  proposedActions: SalesProposedAction[],
  executeRead: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  interceptWrite: (name: string, input: Record<string, unknown>) => unknown,
  trackTokens: (i: number, o: number) => void,
): Promise<string> {
  const anthropicTools = toAnthropicTools(tools);
  const messages: any[] = [{ role: 'user', content: prompt }];

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
        system: SALES_SYSTEM_PROMPT,
        tools: anthropicTools,
        messages,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    trackTokens(data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      const textBlock = data.content.find((b: any) => b.type === 'text');
      if (textBlock?.text) return textBlock.text;
      throw new Error('No text response from sales agent');
    }

    if (data.stop_reason === 'tool_use') {
      const toolUseBlocks = data.content.filter((b: any) => b.type === 'tool_use');
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        const validation = validateToolCall(block.name, 'sales', 'pro');
        let toolOutput: unknown;

        if (!validation.valid) {
          toolOutput = { error: validation.error };
        } else {
          const toolDef = TOOL_REGISTRY.find((t) => t.name === block.name);
          if (toolDef?.access === 'write') {
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
  throw new Error('Sales agent exceeded maximum iterations');
}

async function runOpenAISalesLoop(
  apiKey: string,
  prompt: string,
  tools: typeof TOOL_REGISTRY,
  toolCalls: AgentToolCall[],
  proposedActions: SalesProposedAction[],
  executeRead: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  interceptWrite: (name: string, input: Record<string, unknown>) => unknown,
  trackTokens: (i: number, o: number) => void,
): Promise<string> {
  const openaiTools = toOpenAITools(tools);
  const messages: any[] = [
    { role: 'system', content: SALES_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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

    const data = await res.json();
    trackTokens(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0);

    const choice = data.choices?.[0];
    const message = choice?.message;
    messages.push(message);

    if (choice?.finish_reason === 'stop') return message?.content || '';

    if (choice?.finish_reason === 'tool_calls') {
      for (const tc of message?.tool_calls || []) {
        const toolName = tc.function?.name;
        const toolInput = JSON.parse(tc.function?.arguments || '{}');
        const validation = validateToolCall(toolName, 'sales', 'pro');
        let toolOutput: unknown;

        if (!validation.valid) {
          toolOutput = { error: validation.error };
        } else {
          const toolDef = TOOL_REGISTRY.find((t) => t.name === toolName);
          if (toolDef?.access === 'write') {
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
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolOutput),
        });
      }
      continue;
    }

    throw new Error(`Unexpected finish_reason: ${choice?.finish_reason}`);
  }
  throw new Error('Sales agent exceeded maximum iterations');
}
