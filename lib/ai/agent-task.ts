/**
 * BIZOSTO AGENT TASK QUEUE
 *
 * Firestore collection: agent_tasks
 * Each task represents one agent execution request.
 *
 * Lifecycle:
 *   queued → processing → completed
 *                      ↘ failed
 *                      ↘ awaiting_approval
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { decryptApiKey } from '@/lib/ai/byok-crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentType = 'coo' | 'finance' | 'sales';

export type AgentTaskStatus =
  'queued' | 'processing' | 'completed' | 'failed' | 'awaiting_approval';

export type AgentToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  executedAt: string;
};

export type AgentTask = {
  id: string;
  tenantId: string;
  agentType: AgentType;
  status: AgentTaskStatus;
  /** The user's natural language prompt or the scheduled trigger label */
  prompt: string;
  /** Which tools were called during execution */
  toolCalls: AgentToolCall[];
  /** The agent's final text response */
  result: string | null;
  /** Error message if status is failed */
  error: string | null;
  /** Token usage for cost tracking */
  tokenUsage: { inputTokens: number; outputTokens: number } | null;
  /** LLM provider used for this task */
  provider: 'openai' | 'anthropic' | null;
  /** UID of user who triggered the task */
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type CreateAgentTaskInput = {
  tenantId: string;
  agentType: AgentType;
  prompt: string;
  createdBy: string;
};

// ─── Firestore Helpers ────────────────────────────────────────────────────────

export async function createAgentTask(input: CreateAgentTaskInput): Promise<AgentTask> {
  const ref = adminDb.collection('agent_tasks').doc();
  const now = new Date().toISOString();

  const task: AgentTask = {
    id: ref.id,
    tenantId: input.tenantId,
    agentType: input.agentType,
    status: 'queued',
    prompt: input.prompt,
    toolCalls: [],
    result: null,
    error: null,
    tokenUsage: null,
    provider: null,
    createdBy: input.createdBy,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  };

  await ref.set(task);
  return task;
}

export async function getAgentTask(taskId: string): Promise<AgentTask | null> {
  const snap = await adminDb.collection('agent_tasks').doc(taskId).get();
  if (!snap.exists) return null;
  return snap.data() as AgentTask;
}

export async function updateAgentTask(taskId: string, updates: Partial<AgentTask>): Promise<void> {
  await adminDb.collection('agent_tasks').doc(taskId).set(updates, { merge: true });
}

export async function listAgentTasks(tenantId: string, limit = 20): Promise<AgentTask[]> {
  const snap = await adminDb
    .collection('agent_tasks')
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => doc.data() as AgentTask);
}

export async function markTaskProcessing(taskId: string): Promise<void> {
  await updateAgentTask(taskId, {
    status: 'processing',
    startedAt: new Date().toISOString(),
  });
}

export async function markTaskCompleted(
  taskId: string,
  result: string,
  toolCalls: AgentToolCall[],
  tokenUsage: AgentTask['tokenUsage'],
  provider: AgentTask['provider'],
): Promise<void> {
  await updateAgentTask(taskId, {
    status: 'completed',
    result,
    toolCalls,
    tokenUsage,
    provider,
    completedAt: new Date().toISOString(),
  });
}

export async function markTaskFailed(taskId: string, error: string): Promise<void> {
  await updateAgentTask(taskId, {
    status: 'failed',
    error,
    completedAt: new Date().toISOString(),
  });
}

export async function getTenantAIKey(
  tenantId: string,
): Promise<{ provider: 'openai' | 'anthropic'; apiKey: string } | null> {
  const snap = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('settings')
    .doc('ai_workforce')
    .get();

  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!data.apiKey || !data.provider) return null;

  return {
    provider: data.provider as 'openai' | 'anthropic',
    // Stored encrypted at rest; decrypt only here, server-side, at call time.
    apiKey: decryptApiKey(String(data.apiKey)),
  };
}
