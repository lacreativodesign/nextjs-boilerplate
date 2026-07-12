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

/**
 * Stuck-task recovery (AI-1).
 *
 * The run endpoint executes the agent loop synchronously inside one Vercel
 * invocation (maxDuration = 55s). If that invocation times out, is killed, or
 * the caller drops the request, the task is left in `processing` (or `queued`,
 * if the run call never landed) forever — markTaskCompleted/markTaskFailed never
 * run, and the widget polls a task that will never finish.
 *
 * There is no worker to sweep these, so recovery happens lazily on read: any
 * task still unfinished past this deadline is reported (and persisted) as
 * failed. The widget stops polling on `failed`, so the user sees a real error
 * instead of an infinite spinner. The window is generously past maxDuration so a
 * legitimately-running task is never killed early.
 */
const STUCK_TASK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (>> maxDuration of 55s)
const STUCK_TASK_ERROR = 'Agent run timed out or was interrupted. Please try again.';

function isStuck(task: AgentTask, now = Date.now()): boolean {
  if (task.status !== 'queued' && task.status !== 'processing') return false;
  // startedAt is set when the run begins; fall back to createdAt for tasks whose
  // run call never landed at all.
  const since = Date.parse(String(task.startedAt || task.createdAt || ''));
  if (!Number.isFinite(since)) return false;
  return now - since > STUCK_TASK_TIMEOUT_MS;
}

/**
 * Marks a stuck task failed and returns the corrected task. Best-effort: if the
 * write fails we still report it as failed to the caller rather than leaving the
 * UI spinning.
 */
async function recoverIfStuck(task: AgentTask): Promise<AgentTask> {
  if (!isStuck(task)) return task;

  const failed: AgentTask = {
    ...task,
    status: 'failed',
    error: STUCK_TASK_ERROR,
    completedAt: new Date().toISOString(),
  };

  try {
    await updateAgentTask(task.id, {
      status: 'failed',
      error: STUCK_TASK_ERROR,
      completedAt: failed.completedAt,
    });
  } catch (err) {
    console.error('[AI] Failed to persist stuck-task recovery', { taskId: task.id, err });
  }

  return failed;
}

export async function getAgentTask(taskId: string): Promise<AgentTask | null> {
  const snap = await adminDb.collection('agent_tasks').doc(taskId).get();
  if (!snap.exists) return null;
  return recoverIfStuck(snap.data() as AgentTask);
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

  return Promise.all(snap.docs.map((doc) => recoverIfStuck(doc.data() as AgentTask)));
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
