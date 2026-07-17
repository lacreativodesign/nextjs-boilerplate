import * as fs from 'fs';
import * as path from 'path';
import { TOOL_REGISTRY } from '@/lib/ai/tool-registry';

/**
 * S10 — AI write tools cannot execute without an approved, tenant-scoped proposal.
 *
 * The sales agent correctly QUEUES update_lead_status / create_lead as pending proposals
 * for human approval. But the endpoint that performs the write, /api/ai/tools/sales-write,
 * never checked that a proposal existed or had been approved: it took `input` straight
 * from the request body, executed the lead mutation immediately, and only afterwards used
 * taskId/actionId to stamp an audit trail. Two consequences:
 *
 *  1. The human approval gate was bypassable by calling the endpoint directly, and the AI
 *     audit trail could be fabricated for an action the agent never proposed.
 *  2. agent_tasks/{taskId} was read and written with NO tenant check, so a caller in
 *     tenant A could pass tenant B's taskId and mutate B's proposed actions.
 *
 * The registry also declared update_lead_status as requiresApproval:false — the only
 * mutating tool not marked as needing approval.
 *
 * finance-write already implemented the correct contract; sales-write now mirrors it.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S10: every mutating tool requires approval', () => {
  it('no write tool is registered without requiresApproval', () => {
    const offenders = TOOL_REGISTRY.filter(
      (tool) => tool.access === 'write' && tool.requiresApproval !== true,
    ).map((tool) => tool.name);

    expect(offenders).toEqual([]);
  });

  it('update_lead_status specifically requires approval', () => {
    const tool = TOOL_REGISTRY.find((t) => t.name === 'update_lead_status');
    expect(tool).toBeDefined();
    expect(tool!.access).toBe('write');
    expect(tool!.requiresApproval).toBe(true);
  });

  it('read-only tools are still ungated', () => {
    const reads = TOOL_REGISTRY.filter((t) => t.access === 'read_only');
    expect(reads.length).toBeGreaterThan(0);
  });
});

describe('S10: sales-write enforces an approved, tenant-scoped proposal', () => {
  const src = read('app/api/ai/tools/sales-write/route.ts');

  it('loads the agent task scoped to the caller tenant', () => {
    expect(src).toContain('loadTenantTask(taskId, user.tenantId!)');
    expect(src).toMatch(/taskData\.tenantId !== tenantId/);
  });

  it('requires the proposed action to exist', () => {
    expect(src).toContain('Proposed action not found');
  });

  it('refuses an action that is not still pending', () => {
    expect(src).toMatch(/proposedAction\.status !== 'pending'/);
    expect(src).toMatch(/Action already/);
  });

  it('refuses a mismatched tool name', () => {
    expect(src).toMatch(/proposedAction\.toolName !== 'update_lead_status'/);
    expect(src).toContain('Action type mismatch');
  });

  it('executes the APPROVED proposal, not attacker-supplied body input', () => {
    expect(src).toMatch(/const proposedInput = \(proposedAction\.input \|\| \{\}\)/);
    expect(src).toMatch(/const leadId = String\(proposedInput\.leadId/);
    expect(src).toMatch(/const stage = String\(proposedInput\.stage/);
    expect(src).not.toMatch(/const leadId = String\(input\?\.leadId/);
    expect(src).not.toMatch(/const stage = String\(input\?\.stage/);
  });

  it('no longer blind-writes agent_tasks without a tenant check', () => {
    expect(src).not.toMatch(
      /const taskSnap = await adminDb\.collection\('agent_tasks'\)\.doc\(taskId\)\.get\(\);\s*\n\s*if \(taskSnap\.exists\)/,
    );
  });

  it('supports rejecting a proposal', () => {
    expect(src).toContain("action === 'reject_proposed_action'");
  });
});
