/**
 * The Firestore index workflow's safety properties, pinned.
 *
 * These are the invariants an independent review asked for. Each one is a property
 * somebody could remove in a single careless edit, and none of them would fail any
 * other test in this repository — the workflow is dispatched by hand against a
 * production project, so a regression here surfaces as a deleted index rather than
 * as a red build.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  ALLOWED_DATABASE,
  ALLOWED_PROJECT,
  applyPlan,
  buildCreateArgs,
  planDigest,
  validateIndexDefinition,
} from '@/scripts/firestore-index-apply.mjs';

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/deploy-indexes.yml'),
  'utf8',
);

/**
 * The workflow without its comment lines.
 *
 * The comments explain at length why `firebase deploy` is not used and what it would
 * have done, so asserting "this file does not mention X" would fail on the very
 * documentation that exists to prevent X. The properties below are about what the
 * workflow RUNS, so they are asserted against the executable lines only.
 */
const commands = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

describe('the index workflow never deploys as a side effect', () => {
  it('is dispatch-only — merging an index change deploys nothing', () => {
    // The original ran on push to main whenever firestore.indexes.json changed, so
    // merging a PR that touched the manifest deployed to production unattended.
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s{2}push:/m);
    expect(workflow).not.toMatch(/^\s{2}schedule:/m);
    expect(workflow).not.toMatch(/^\s{2}pull_request:/m);
  });

  it('defaults to the read-only mode', () => {
    expect(workflow).toMatch(/default:\s*inventory/);
  });
});

describe('inventory is read-only by identity, not by convention', () => {
  it('uses a reader service account distinct from the deployer', () => {
    expect(workflow).toContain('GCP_FIRESTORE_INDEX_READER_SA');
    expect(workflow).toContain('GCP_FIRESTORE_INDEX_DEPLOYER_SA');
    expect(workflow).not.toContain('GCP_FIRESTORE_INDEX_SA');
  });

  it('never names the deployer identity in the inventory job', () => {
    const inventory = workflow.slice(
      workflow.indexOf('  inventory:'),
      workflow.indexOf('  deploy:'),
    );
    expect(inventory).toContain('GCP_FIRESTORE_INDEX_READER_SA');
    expect(inventory).not.toContain('GCP_FIRESTORE_INDEX_DEPLOYER_SA');
  });

  it('never names the reader identity in the deploy job', () => {
    const deploy = workflow.slice(workflow.indexOf('  deploy:'));
    expect(deploy).toContain('GCP_FIRESTORE_INDEX_DEPLOYER_SA');
    expect(deploy).not.toContain('GCP_FIRESTORE_INDEX_READER_SA');
  });
});

describe('the deploy target cannot be redirected', () => {
  it('pins the project as a constant rather than accepting it as an input', () => {
    expect(workflow).toMatch(/PROJECT_ID:\s*la-creativo-erp/);
    // A free-text project input is a way to point a production credential elsewhere.
    expect(workflow).not.toMatch(/^\s+project_id:\s*$/m);
    expect(workflow).not.toMatch(/inputs\.project_id/);
  });

  it('pins the default database', () => {
    expect(workflow).toMatch(/FIRESTORE_DATABASE:\s*'\(default\)'/);
    expect(workflow).toContain('--database="$FIRESTORE_DATABASE"');
  });

  it('requires the project id to be typed back before deploying', () => {
    expect(workflow).toContain('confirm_project_id');
    expect(workflow).toContain('if [ "$CONFIRM" != "$PROJECT_ID" ]; then');
  });
});

describe('deploy is gated on an approved main ref', () => {
  it('refuses any ref but refs/heads/main', () => {
    expect(workflow).toContain('if [ "$REF" != "refs/heads/main" ]; then');
    expect(workflow).toContain('Refusing to deploy');
  });

  it('runs only in deploy mode and only after the inventory job', () => {
    expect(workflow).toMatch(/if:\s*\$\{\{\s*inputs\.mode == 'deploy'\s*\}\}/);
    expect(workflow).toMatch(/needs:\s*inventory/);
  });

  it('runs inside an environment, which is what carries the reviewer requirement', () => {
    expect(workflow).toMatch(/environment:\s*firestore-indexes-production/);
  });

  it('interpolates untrusted inputs through env, never directly into a shell line', () => {
    // `${{ inputs.x }}` inside a run block is a script-injection vector.
    const runBlocks = workflow.split(/\n\s+run: \|/).slice(1);
    for (const block of runBlocks) {
      const body = block.split(/\n\s+- name:/)[0];
      expect(body).not.toMatch(/\$\{\{\s*inputs\./);
      expect(body).not.toMatch(/\$\{\{\s*github\./);
    }
  });
});

describe('nothing in the workflow can delete an index', () => {
  it('never invokes firebase deploy, which reconciles in both directions', () => {
    expect(commands).not.toMatch(/firebase deploy/);
    expect(commands).not.toMatch(/firebase-tools/);
  });

  it('never passes --force, which is what would authorise deletions', () => {
    expect(commands).not.toContain('--force');
  });

  it('only ever invokes `composite list` directly; creates go through the apply script', () => {
    expect(commands).not.toMatch(/indexes composite (delete|update|create)/);
    const calls = commands.match(/gcloud firestore indexes composite \w+/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/composite list$/);
    }
    // The only writing path is the argv-spawning script, which validates its plan.
    expect(commands).toContain('firestore-index-apply.mjs');
  });

  it('re-reads live state in the deploy job rather than trusting the earlier artifact', () => {
    const deploy = workflow.slice(workflow.indexOf('  deploy:'));
    expect(deploy).toContain('indexes composite list');
    expect(deploy).toContain('firestore-index-reconcile.mjs');
  });

  it('binds the write to the plan digest published before approval', () => {
    // The owner reads the proposed additions in the inventory job summary, which runs
    // before the environment gate. --expect-digest makes the deploy refuse anything
    // other than that exact plan, so a manifest cannot be substituted after approval.
    expect(workflow).toContain('plan-digest: ${{ steps.reconcile.outputs.plan-digest }}');
    expect(workflow).toContain('APPROVED_PLAN_DIGEST: ${{ needs.inventory.outputs.plan-digest }}');
    expect(commands).toContain('--expect-digest');
    expect(workflow).toContain('GITHUB_STEP_SUMMARY');
  });

  it('interpolates step and job outputs through env too, never into a run line', () => {
    const runBlocks = workflow.split(/\n\s+run: \|/).slice(1);
    for (const block of runBlocks) {
      const body = block.split(/\n\s+- name:/)[0];
      expect(body).not.toMatch(/\$\{\{\s*steps\./);
      expect(body).not.toMatch(/\$\{\{\s*needs\./);
    }
  });

  it('waits for READY rather than treating acceptance as completion', () => {
    expect(workflow).toContain('All indexes READY.');
    expect(workflow).toMatch(/state\s*!==\s*"READY"/);
  });
});

describe('the apply plan is a validated schema, not a command line', () => {
  const definition = (collectionGroup = 'leads') => ({
    describe: `${collectionGroup} (COLLECTION): tenantId ASCENDING`,
    collectionGroup,
    queryScope: 'COLLECTION',
    fields: [{ fieldPath: 'tenantId', order: 'ASCENDING' }],
  });

  const plan = (indexes: unknown[]) =>
    JSON.stringify({
      project: ALLOWED_PROJECT,
      database: ALLOWED_DATABASE,
      manifestSha256: 'a'.repeat(64),
      indexes,
    });

  const target = { project: ALLOWED_PROJECT, database: ALLOWED_DATABASE };

  it('accepts a well-formed plan and builds the argv itself', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const result = applyPlan(plan([definition('leads'), definition('projects')]), target, {
      run: (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return { status: 0 };
      },
      log: () => {},
    });

    expect(result.created).toBe(2);
    for (const call of calls) {
      expect(call.cmd).toBe('gcloud');
      expect(call.args.slice(0, 4)).toEqual(['firestore', 'indexes', 'composite', 'create']);
      expect(call.args).toContain(`--project=${ALLOWED_PROJECT}`);
      expect(call.args).toContain(`--database=${ALLOWED_DATABASE}`);
      expect(call.args).toContain('--async');
      // Exactly one of each resource flag — gcloud resolves a repeat to the LAST one.
      expect(call.args.filter((a: string) => a.startsWith('--project='))).toHaveLength(1);
      expect(call.args.filter((a: string) => a.startsWith('--database='))).toHaveLength(1);
    }
  });

  it('ignores any argv a tampered plan tries to supply', () => {
    // The old format stored argv. It no longer does, so extra keys are inert.
    const smuggled = {
      ...definition('leads'),
      args: ['firestore', 'indexes', 'composite', 'delete', '--project=someone-else'],
    };
    const calls: string[][] = [];
    applyPlan(plan([smuggled]), target, {
      run: (_cmd: string, args: string[]) => {
        calls.push(args);
        return { status: 0 };
      },
      log: () => {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('create');
    expect(calls[0].join(' ')).not.toContain('someone-else');
    expect(calls[0].join(' ')).not.toContain('delete');
  });

  it.each([
    ['a cross-project resource name', { collectionGroup: 'projects/other/databases/(default)/x' }],
    ['a flag smuggled into the collection group', { collectionGroup: 'leads --project=other' }],
    ['a path separator in the collection group', { collectionGroup: 'a/b' }],
    ['an empty collection group', { collectionGroup: '' }],
  ])('rejects %s', (_label, override) => {
    expect(() =>
      applyPlan(plan([{ ...definition(), ...override }]), target, { log: () => {} }),
    ).toThrow(/unacceptable collection group/);
  });

  it.each([
    ['--impersonate-service-account', 'tenantId --impersonate-service-account=x@y'],
    ['--flags-file', 'tenantId --flags-file=/tmp/x'],
    ['a shell metacharacter', 'tenantId;rm'],
  ])('rejects %s smuggled into a field path', (_label, fieldPath) => {
    const bad = { ...definition(), fields: [{ fieldPath, order: 'ASCENDING' }] };
    expect(() => applyPlan(plan([bad]), target, { log: () => {} })).toThrow(
      /unacceptable field path/,
    );
  });

  it('rejects an unacceptable query scope, order, or array config', () => {
    expect(() =>
      applyPlan(plan([{ ...definition(), queryScope: 'EVERYTHING' }]), target, { log: () => {} }),
    ).toThrow(/unacceptable query scope/);
    expect(() =>
      applyPlan(
        plan([{ ...definition(), fields: [{ fieldPath: 'x', order: 'SIDEWAYS' }] }]),
        target,
        {
          log: () => {},
        },
      ),
    ).toThrow(/unacceptable order/);
    expect(() =>
      applyPlan(
        plan([{ ...definition(), fields: [{ fieldPath: 'x', arrayConfig: 'ANY' }] }]),
        target,
        {
          log: () => {},
        },
      ),
    ).toThrow(/unacceptable array config/);
  });

  it('refuses a plan aimed at another project or database', () => {
    const elsewhere = JSON.stringify({
      project: 'someone-elses-project',
      database: ALLOWED_DATABASE,
      manifestSha256: 'a'.repeat(64),
      indexes: [definition()],
    });
    expect(() => applyPlan(elsewhere, target, { log: () => {} })).toThrow(/not la-creativo-erp/);

    const otherDb = JSON.stringify({
      project: ALLOWED_PROJECT,
      database: 'analytics',
      manifestSha256: 'a'.repeat(64),
      indexes: [definition()],
    });
    expect(() => applyPlan(otherDb, target, { log: () => {} })).toThrow(/not \(default\)/);
  });

  it('refuses to build argv for a target other than the approved one', () => {
    expect(() =>
      buildCreateArgs(validateIndexDefinition(definition()), {
        project: 'other',
        database: ALLOWED_DATABASE,
      }),
    ).toThrow(/Refusing to target project/);
  });

  it('requires the plan to name the manifest it came from', () => {
    const unbound = JSON.stringify({
      project: ALLOWED_PROJECT,
      database: ALLOWED_DATABASE,
      indexes: [definition()],
    });
    expect(() => applyPlan(unbound, target, { log: () => {} })).toThrow(/manifest sha256/);
  });

  it('refuses to run a plan that differs from the one approved', () => {
    // This is what stops a different manifest being substituted after approval.
    const serialized = plan([definition()]);
    expect(() =>
      applyPlan(serialized, { ...target, expectDigest: 'b'.repeat(64) }, { log: () => {} }),
    ).toThrow(/does not match the approved digest/);
  });

  it('treats an EMPTY approved digest as a broken binding, not as no binding', () => {
    // The failure mode this closes: a workflow output that does not render arrives as
    // '' rather than being absent. Under a truthiness test that reads as "nothing to
    // check" and the write proceeds unbound — silently, which is the worst version of
    // it. The only control tying this create to what the owner approved must not be
    // switchable off by an empty string.
    const serialized = plan([definition()]);
    expect(() =>
      applyPlan(
        serialized,
        { ...target, expectDigest: '' },
        { run: () => ({ status: 0 }), log: () => {} },
      ),
    ).toThrow(/does not match the approved digest/);
  });

  it('runs when the digest matches the approved one', () => {
    const serialized = plan([definition()]);
    const digest = planDigest(serialized);
    const result = applyPlan(
      serialized,
      { ...target, expectDigest: digest },
      { run: () => ({ status: 0 }), log: () => {} },
    );
    expect(result.created).toBe(1);
    expect(result.digest).toBe(digest);
  });

  it('stops at the first failure instead of ploughing through the rest', () => {
    let calls = 0;
    expect(() =>
      applyPlan(plan([definition('a'), definition('b'), definition('c')]), target, {
        run: () => {
          calls += 1;
          return calls === 2 ? { status: 1, stderr: 'permission denied' } : { status: 0 };
        },
        log: () => {},
      }),
    ).toThrow(/gcloud exited 1/);
    expect(calls).toBe(2);
  });

  it('does nothing at all for an empty plan', () => {
    const result = applyPlan(plan([]), target, {
      run: () => {
        throw new Error('should not spawn anything');
      },
      log: () => {},
    });
    expect(result.created).toBe(0);
  });
});

/**
 * The command-line entry point, driven as a real process.
 *
 * Everything above imports `applyPlan` directly, which is the right way to test the
 * validation rules but skips the argument handling that stands between a workflow step
 * and a live project. The production path is `node scripts/firestore-index-apply.mjs`,
 * and the property that matters there is that it cannot be run unbound: without a
 * well-formed `--expect-digest` there is nothing tying the create to the plan the owner
 * read, so the entry point refuses rather than defaulting to "no expectation".
 */
describe('the apply CLI cannot write unbound to an approved plan', () => {
  const script = path.join(process.cwd(), 'scripts', 'firestore-index-apply.mjs');

  const withPlanFile = (body: (planPath: string) => void): void => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'firestore-index-apply-'));
    const planPath = path.join(dir, 'create-plan.json');
    fs.writeFileSync(
      planPath,
      `${JSON.stringify(
        {
          project: ALLOWED_PROJECT,
          database: ALLOWED_DATABASE,
          manifestSha256: 'a'.repeat(64),
          // Inlined rather than reusing the helper above: that one is scoped to its own
          // describe, and this block deliberately shares nothing with the in-process tests.
          indexes: [
            {
              collectionGroup: 'leads',
              queryScope: 'COLLECTION',
              fields: [{ fieldPath: 'tenantId', order: 'ASCENDING' }],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    body(planPath);
  };

  const run = (args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('refuses to run with no --expect-digest at all', () => {
    withPlanFile((planPath) => {
      const result = run(['--plan', planPath]);
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(/--expect-digest .* is required/);
    });
  });

  it('refuses an empty --expect-digest', () => {
    withPlanFile((planPath) => {
      const result = run(['--plan', planPath, '--expect-digest', '']);
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(/--expect-digest .* is required/);
    });
  });

  it('refuses a malformed --expect-digest rather than comparing it', () => {
    withPlanFile((planPath) => {
      const result = run(['--plan', planPath, '--expect-digest', 'not-a-sha']);
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(/--expect-digest .* is required/);
    });
  });

  it('gets past the binding check with a well-formed digest, and fails on the mismatch', () => {
    // Proves the guard above is about the ARGUMENT being present and well-formed, and
    // that a real digest still goes on to be compared rather than waved through.
    withPlanFile((planPath) => {
      const result = run(['--plan', planPath, '--expect-digest', 'b'.repeat(64)]);
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(/does not match the approved digest/);
    });
  });
});
