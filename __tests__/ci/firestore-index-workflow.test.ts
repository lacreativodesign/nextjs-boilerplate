/**
 * The Firestore index workflow's safety properties, pinned.
 *
 * These are the invariants an independent review asked for. Each one is a property
 * somebody could remove in a single careless edit, and none of them would fail any
 * other test in this repository — the workflow is dispatched by hand against a
 * production project, so a regression here surfaces as a deleted index rather than
 * as a red build.
 */
import * as fs from 'fs';
import * as path from 'path';

import { applyPlan, assertCreateOnly } from '@/scripts/firestore-index-apply.mjs';

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

  it('waits for READY rather than treating acceptance as completion', () => {
    expect(workflow).toContain('All indexes READY.');
    expect(workflow).toMatch(/state\s*!==\s*"READY"/);
  });
});

describe('the apply step can only create', () => {
  const step = (collectionGroup: string) => ({
    index: collectionGroup,
    args: [
      'firestore',
      'indexes',
      'composite',
      'create',
      '--project=la-creativo-erp',
      `--collection-group=${collectionGroup}`,
    ],
  });

  it('accepts a plan of composite creates', () => {
    expect(() => assertCreateOnly([step('leads')])).not.toThrow();
  });

  it('rejects a plan step that deletes', () => {
    const bad = { index: 'leads', args: ['firestore', 'indexes', 'composite', 'delete', 'ix'] };
    expect(() => assertCreateOnly([bad])).toThrow(/not a composite-index create/);
  });

  it('rejects a plan step carrying --force', () => {
    const bad = step('leads');
    bad.args.push('--force');
    expect(() => assertCreateOnly([bad])).toThrow(/--force/);
  });

  it('rejects a plan that reaches a different gcloud surface entirely', () => {
    const bad = { index: 'x', args: ['firestore', 'databases', 'delete', '--database=(default)'] };
    expect(() => assertCreateOnly([bad])).toThrow(/not a composite-index create/);
  });

  it('spawns gcloud once per index, with --async, and never through a shell', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const result = applyPlan([step('leads'), step('projects')], {
      run: (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return { status: 0 };
      },
      log: () => {},
    });

    expect(result).toEqual({ created: 2 });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.cmd).toBe('gcloud');
      expect(call.args).toContain('--async');
      expect(call.args.slice(0, 4)).toEqual(['firestore', 'indexes', 'composite', 'create']);
    }
  });

  it('stops at the first failure instead of ploughing through the rest', () => {
    let calls = 0;
    expect(() =>
      applyPlan([step('a'), step('b'), step('c')], {
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
    const result = applyPlan([], {
      run: () => {
        throw new Error('should not spawn anything');
      },
      log: () => {},
    });
    expect(result).toEqual({ created: 0 });
  });
});
