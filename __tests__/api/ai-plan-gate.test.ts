import * as fs from 'fs';
import * as path from 'path';
import { FirestoreEmulator } from './test-utils/firestore-emulator';

/**
 * Server-side AI plan gate (AI-0b).
 *
 * AI Workforce is Pro/Enterprise only. Plan gating lived only in the settings
 * route, so a Starter/trial tenant with a task id could hit run/tool endpoints
 * directly. Every user-facing AI endpoint now enforces the plan server-side.
 * Also fixes the agent-tasks route, which excluded sales roles from creating
 * sales agent tasks.
 */

const seed = () => ({
  tenants: [
    { id: 't_starter', data: { plan: 'starter' } },
    { id: 't_trial', data: { plan: 'trial' } },
    { id: 't_pro', data: { plan: 'pro' } },
    { id: 't_ent', data: { plan: 'enterprise' } },
  ],
});

let db: FirestoreEmulator;
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));

import { checkAiPlan, aiPlanLockedBody } from '@/lib/ai/plan-gate';

beforeEach(() => {
  db = new FirestoreEmulator(seed());
});

describe('checkAiPlan', () => {
  it('locks Starter tenants', async () => {
    const check = await checkAiPlan('t_starter');
    expect(check.ok).toBe(false);
    expect(check.plan).toBe('starter');
  });

  it('locks trial tenants', async () => {
    const check = await checkAiPlan('t_trial');
    expect(check.ok).toBe(false);
  });

  it('allows Pro tenants', async () => {
    const check = await checkAiPlan('t_pro');
    expect(check.ok).toBe(true);
  });

  it('allows Enterprise tenants', async () => {
    const check = await checkAiPlan('t_ent');
    expect(check.ok).toBe(true);
  });

  it('produces an upgrade-guidance body with the ai_plan_locked code', async () => {
    const check = await checkAiPlan('t_starter');
    const body = aiPlanLockedBody(check);
    expect(body.error).toBe('ai_plan_locked');
    expect(body.message.toLowerCase()).toContain('upgrade');
    expect(body.message).toContain('starter');
  });
});

describe('every user-facing AI endpoint enforces the plan gate (static gate)', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  const routes = [
    'app/api/ai/agent-tasks/route.ts',
    'app/api/ai/agent-tasks/[taskId]/route.ts',
    'app/api/ai/agent-tasks/[taskId]/run/route.ts',
    'app/api/ai/agent-tasks/[taskId]/run-sales/route.ts',
    'app/api/ai/agent-tasks/[taskId]/run-finance/route.ts',
    'app/api/ai/natural-language-report/route.ts',
    'app/api/ai/tools/sales-write/route.ts',
    'app/api/ai/tools/finance-write/route.ts',
  ];

  it.each(routes)('%s calls checkAiPlan and returns the locked body', (file) => {
    const source = read(file);
    expect(source).toContain('checkAiPlan');
    expect(source).toContain('aiPlanLockedBody');
  });
});

describe('sales roles can create sales agent tasks (bug fix)', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('agent-tasks route allows sales and sales_manager', () => {
    const source = read('app/api/ai/agent-tasks/route.ts');
    // Extract the ALLOWED_ROLES set and assert sales roles are present.
    expect(source).toContain("'sales'");
    expect(source).toContain("'sales_manager'");
  });
});
