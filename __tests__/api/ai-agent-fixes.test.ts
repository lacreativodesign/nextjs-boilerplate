import * as fs from 'fs';
import * as path from 'path';

/**
 * AI-1 — Agent bug fixes.
 *
 * 1. agent_tasks composite index: listAgentTasks queries
 *    where('tenantId') + orderBy('createdAt','desc'), which Firestore cannot serve
 *    without a composite index. None was declared, so GET /api/ai/agent-tasks
 *    threw FAILED_PRECONDITION in production.
 * 2. Stuck-task recovery: the run endpoint executes synchronously inside one
 *    Vercel invocation (maxDuration 55s). A timeout left the task in
 *    processing/queued forever with no sweep, so the widget polled indefinitely.
 * 3. Hardcoded plan tier: every agent passed a literal 'pro' to validateToolCall,
 *    so each tool's requiredPlan was never evaluated against the tenant's real plan.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('AI-1: agent_tasks composite index exists', () => {
  it('declares tenantId ASC + createdAt DESC for agent_tasks', () => {
    const indexes = JSON.parse(read('firestore.indexes.json')).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order?: string }>;
    }>;

    const agentTaskIndex = indexes.find((i) => i.collectionGroup === 'agent_tasks');
    expect(agentTaskIndex).toBeDefined();

    const fields = agentTaskIndex!.fields.map((f) => `${f.fieldPath}:${f.order}`);
    expect(fields).toEqual(['tenantId:ASCENDING', 'createdAt:DESCENDING']);
  });
});

describe('AI-1: no agent hardcodes the plan tier', () => {
  const sources = [
    'lib/ai/finance-agent.ts',
    'lib/ai/sales-agent.ts',
    'app/api/ai/agent-tasks/[taskId]/run/route.ts',
  ];

  it("never passes a literal 'pro' to validateToolCall", () => {
    for (const rel of sources) {
      const src = read(rel);
      expect(src).not.toMatch(/validateToolCall\([^)]*,\s*'pro'\s*\)/);
      // The tenant's real plan is threaded through instead.
      expect(src).toContain('tenantPlan');
    }
  });

  it('finance and sales agents resolve the tenant plan via checkAiPlan', () => {
    for (const rel of ['lib/ai/finance-agent.ts', 'lib/ai/sales-agent.ts']) {
      const src = read(rel);
      expect(src).toContain("from '@/lib/ai/plan-gate'");
      expect(src).toContain('await checkAiPlan(tenantId)).plan');
    }
  });

  it('the COO run route threads the plan it already resolved', () => {
    const src = read('app/api/ai/agent-tasks/[taskId]/run/route.ts');
    expect(src).toContain('aiPlan.plan');
    expect(src).toContain("validateToolCall(block.name, 'coo', tenantPlan)");
    expect(src).toContain("validateToolCall(toolName, 'coo', tenantPlan)");
  });
});

describe('AI-1: stuck-task recovery', () => {
  const src = read('lib/ai/agent-task.ts');

  it('defines a stuck-task timeout well beyond the 55s run limit', () => {
    expect(src).toContain('STUCK_TASK_TIMEOUT_MS');
    expect(src).toContain('recoverIfStuck');
    // 3 minutes, comfortably past maxDuration so live runs are never killed.
    expect(src).toMatch(/STUCK_TASK_TIMEOUT_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/);
  });

  it('only queued/processing tasks are eligible for recovery', () => {
    expect(src).toMatch(/status !== 'queued' && task\.status !== 'processing'/);
  });

  it('both read paths recover stuck tasks, so the widget stops polling', () => {
    // getAgentTask powers the widget's poll; listAgentTasks powers history.
    const getPath = src.slice(src.indexOf('export async function getAgentTask'));
    expect(getPath.slice(0, 300)).toContain('recoverIfStuck');

    const listPath = src.slice(src.indexOf('export async function listAgentTasks'));
    expect(listPath.slice(0, 400)).toContain('recoverIfStuck');
  });

  it('a recovered task is marked failed with a user-facing error', () => {
    expect(src).toContain("status: 'failed'");
    expect(src).toContain('STUCK_TASK_ERROR');
  });
});
