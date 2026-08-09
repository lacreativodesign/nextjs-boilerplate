import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { REQUEST_TENANT_ROUTES, classifyRouteSource } from '@/lib/api/route-contract';

/**
 * A-1 — the AI tool bus.
 *
 * /api/ai/tools/read executes every read-only agent tool: invoices, leads, projects,
 * team roster and audit trail. It had three compounding defects:
 *
 *   - It authenticated with `secret === expected`, which short-circuits on the first
 *     differing byte and so leaks the secret's prefix through response timing. The two
 *     other internal endpoints, /api/tenant/module-check and
 *     /api/internal/workflow-mutation, each carried their own copy of the same check.
 *   - The secret was INTERNAL_REQUEST_SIGNING_SECRET, which is also the HMAC key for
 *     signup OTPs (lib/auth/otp.ts) and for middleware's signed subscription cache. One
 *     recovered header bought OTP forgery and tenant data access at the same time.
 *   - The tenant to query came out of the request body, so a caller holding that header
 *     could name any tenantId and read that workspace. The caller now cites an agent
 *     task and the tenant is resolved from the task's server-side document.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TOOL_BUS = 'app/api/ai/tools/read/route.ts';
const MODULE_CHECK = 'app/api/tenant/module-check/route.ts';
const WORKFLOW_MUTATION = 'app/api/internal/workflow-mutation/route.ts';
const INTERNAL_ROUTES = [TOOL_BUS, MODULE_CHECK, WORKFLOW_MUTATION];

/** The three server-side callers of the tool bus. */
const BUS_CALLERS = [
  'lib/ai/finance-agent.ts',
  'lib/ai/sales-agent.ts',
  'app/api/ai/agent-tasks/[taskId]/run/route.ts',
];

describe('A-1: secret comparison is constant-time', () => {
  const ORIGINAL = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  const ORIGINAL_BUS = process.env.AI_TOOL_BUS_SECRET;

  afterEach(() => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = ORIGINAL;
    if (ORIGINAL_BUS === undefined) delete process.env.AI_TOOL_BUS_SECRET;
    else process.env.AI_TOOL_BUS_SECRET = ORIGINAL_BUS;
    jest.resetModules();
  });

  const load = () => require('@/lib/api/internal-secret');

  it('matches identical secrets and rejects near-misses', () => {
    const { secretsMatch } = load();
    expect(secretsMatch('s3cret-value', 's3cret-value')).toBe(true);
    // Differs only in the final byte: a prefix-comparing implementation returns late.
    expect(secretsMatch('s3cret-valuf', 's3cret-value')).toBe(false);
    // Differs only in length: timingSafeEqual would throw on raw buffers.
    expect(secretsMatch('s3cret-value-longer', 's3cret-value')).toBe(false);
  });

  it('fails closed on an absent or empty secret', () => {
    const { secretsMatch } = load();
    expect(secretsMatch('anything', undefined)).toBe(false);
    expect(secretsMatch(undefined, 'anything')).toBe(false);
    expect(secretsMatch(null, null)).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
  });

  it('no internal route compares secrets with === or !==', () => {
    for (const rel of INTERNAL_ROUTES) {
      const src = read(rel);
      expect(src).not.toMatch(/secret\s*[!=]==\s*expected/);
      expect(src).not.toMatch(/expected\s*[!=]==\s*secret/);
    }
  });

  it('every internal route verifies through the shared helper', () => {
    expect(read(TOOL_BUS)).toContain('verifyAiToolBusSecret(req)');
    expect(read(MODULE_CHECK)).toContain('verifyInternalSecret(req)');
    expect(read(WORKFLOW_MUTATION)).toContain('verifyInternalSecret(req)');
  });

  it('the helper is the only place the internal header is read', () => {
    const offenders = INTERNAL_ROUTES.filter((rel) =>
      read(rel).includes("get('x-internal-secret')"),
    );
    expect(offenders).toEqual([]);
    expect(read('lib/api/internal-secret.ts')).toContain("get('x-internal-secret')");
  });
});

describe('A-1: the tool bus has its own secret', () => {
  const ORIGINAL = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  const ORIGINAL_BUS = process.env.AI_TOOL_BUS_SECRET;

  afterEach(() => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = ORIGINAL;
    if (ORIGINAL_BUS === undefined) delete process.env.AI_TOOL_BUS_SECRET;
    else process.env.AI_TOOL_BUS_SECRET = ORIGINAL_BUS;
    jest.resetModules();
  });

  const load = () => {
    jest.resetModules();
    return require('@/lib/api/internal-secret');
  };

  it('never equals the root secret, so a leaked bus secret cannot forge OTPs', () => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'root-signing-secret';
    delete process.env.AI_TOOL_BUS_SECRET;

    const { getAiToolBusSecret } = load();
    const derived = getAiToolBusSecret();

    expect(derived).toBeTruthy();
    expect(derived).not.toBe('root-signing-secret');
    // One-way: the root is not recoverable from the derived value.
    expect(derived).not.toContain('root-signing-secret');
  });

  it('is a deterministic HMAC of the root, so caller and verifier always agree', () => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'root-signing-secret';
    delete process.env.AI_TOOL_BUS_SECRET;

    const { getAiToolBusSecret } = load();
    const expected = crypto
      .createHmac('sha256', 'root-signing-secret')
      .update('bizosto:ai-tool-bus:v1')
      .digest('hex');

    expect(getAiToolBusSecret()).toBe(expected);
    expect(getAiToolBusSecret()).toBe(expected);
  });

  it('prefers an explicitly configured AI_TOOL_BUS_SECRET', () => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'root-signing-secret';
    process.env.AI_TOOL_BUS_SECRET = 'independent-bus-secret';

    const { getAiToolBusSecret } = load();
    expect(getAiToolBusSecret()).toBe('independent-bus-secret');
  });

  it('returns null when nothing is configured, so the bus rejects every caller', () => {
    delete process.env.INTERNAL_REQUEST_SIGNING_SECRET;
    delete process.env.AI_TOOL_BUS_SECRET;

    const { getAiToolBusSecret, secretsMatch } = load();
    expect(getAiToolBusSecret()).toBeNull();
    expect(secretsMatch('anything', getAiToolBusSecret())).toBe(false);
  });

  it('no bus caller sends the root secret over the wire', () => {
    for (const rel of BUS_CALLERS) {
      const src = read(rel);
      expect(src).toContain('getAiToolBusSecret()');
      expect(src).not.toContain('INTERNAL_REQUEST_SIGNING_SECRET');
    }
  });
});

describe('A-1: the tool bus resolves the tenant itself', () => {
  it('takes a taskId and never a caller-supplied tenantId', () => {
    const src = read(TOOL_BUS);
    expect(src).toContain('tool and taskId required');
    expect(src).not.toMatch(/\btenantId\b\s*[,}]\s*=?\s*.*=\s*body/);
    expect(src).not.toContain('body.tenantId');
  });

  it('reads the tenant from the agent task document', () => {
    const src = read(TOOL_BUS);
    expect(src).toContain("adminDb.collection('agent_tasks')");
    expect(src).toMatch(/resolveTenantId\(\s*taskId\s*\)/);
  });

  it('rejects a taskId that resolves to nothing rather than querying blind', () => {
    const src = read(TOOL_BUS);
    const guardIdx = src.indexOf('Task not found');
    const executeIdx = src.indexOf('executeTool(tool');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(executeIdx).toBeGreaterThan(guardIdx);
  });

  it('every caller sends taskId, not tenantId, in the bus payload', () => {
    for (const rel of BUS_CALLERS) {
      const src = read(rel);
      expect(src).toContain('tool: toolName, taskId, input');
      expect(src).not.toContain('tool: toolName, tenantId, input');
    }
  });

  it('the tool bus is not on the request-tenant exception list', () => {
    expect(REQUEST_TENANT_ROUTES['ai/tools/read']).toBeUndefined();
  });

  it('workflow-mutation keeps its body tenantId, but only with a written justification', () => {
    const why = REQUEST_TENANT_ROUTES['internal/workflow-mutation'];
    expect(typeof why).toBe('string');
    expect(why.trim().length).toBeGreaterThan(0);
  });
});

describe('A-1: the guards still classify these routes', () => {
  it('all three internal routes classify as internal after the refactor', () => {
    for (const rel of INTERNAL_ROUTES) {
      const routePath = rel.replace(/^app\/api\//, '').replace(/\/route\.ts$/, '');
      expect(classifyRouteSource(routePath, read(rel))).toBe('internal');
    }
  });
});
