#!/usr/bin/env node
/**
 * Applies a create-only index plan produced by `firestore-index-reconcile.mjs`.
 *
 * Every command is spawned with an explicit argv array, never through a shell. That
 * removes word-splitting and quoting from the picture entirely: a field path
 * containing a space or a quote cannot become a second argument, and nothing in the
 * plan can be interpreted as a shell operator.
 *
 * The plan is re-validated here rather than trusted. It is written by the reconciler
 * in the same job, but the check costs nothing and this is the last point before a
 * production project is written to: every step must be
 * `gcloud firestore indexes composite create`, and no step may carry a flag that
 * could destroy anything.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Flags that must never appear in a create plan. */
const FORBIDDEN_FLAGS = ['--force', '--quiet-delete'];

/** Verbs that must never appear where the plan's action word belongs. */
const REQUIRED_PREFIX = ['firestore', 'indexes', 'composite', 'create'];

/**
 * Throws unless every step is a composite-index create. Returns the plan.
 *
 * @param {Array<{args: string[]}>} plan
 */
export function assertCreateOnly(plan) {
  if (!Array.isArray(plan)) throw new Error('Create plan must be an array.');

  plan.forEach((step, position) => {
    const args = step?.args;
    if (!Array.isArray(args)) {
      throw new Error(`Plan step ${position} has no argv array.`);
    }
    const prefix = args.slice(0, REQUIRED_PREFIX.length);
    if (prefix.join(' ') !== REQUIRED_PREFIX.join(' ')) {
      throw new Error(`Plan step ${position} is not a composite-index create: ${args.join(' ')}`);
    }
    for (const flag of FORBIDDEN_FLAGS) {
      if (args.includes(flag)) {
        throw new Error(`Plan step ${position} carries ${flag}: ${args.join(' ')}`);
      }
    }
    const destructive = args.find((arg) => /^(delete|remove|destroy|update)$/.test(arg));
    if (destructive) {
      throw new Error(`Plan step ${position} contains "${destructive}": ${args.join(' ')}`);
    }
  });

  return plan;
}

/**
 * @param {Array<{index?: string, args: string[]}>} plan
 * @param {{ run?: (cmd: string, args: string[]) => {status: number|null, stderr?: string} , log?: (m: string) => void }} io
 */
export function applyPlan(plan, io = {}) {
  const run =
    io.run ||
    ((cmd, args) =>
      spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' }));
  const log = io.log || console.log;

  assertCreateOnly(plan);

  if (plan.length === 0) {
    log('Nothing to create; live already matches the manifest.');
    return { created: 0 };
  }

  log(`Creating ${plan.length} index(es).`);
  let created = 0;
  for (const step of plan) {
    log(`  + ${step.index || step.args.join(' ')}`);
    // `--async` returns once the create is accepted. The workflow then waits for
    // READY separately, because acceptance is not availability.
    const result = run('gcloud', [...step.args, '--async']);
    if (result.status !== 0) {
      throw new Error(
        `gcloud exited ${result.status} for: ${step.args.join(' ')}\n${result.stderr || ''}`.trim(),
      );
    }
    created += 1;
  }
  return { created };
}

function arg(argv, name) {
  const hit = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = argv.indexOf(`--${name}`);
  return at !== -1 ? argv[at + 1] : undefined;
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  try {
    const planPath = arg(process.argv.slice(2), 'plan') || 'create-plan.json';
    applyPlan(JSON.parse(readFileSync(planPath, 'utf8')));
  } catch (err) {
    console.error(`\nIndex apply failed.\n  ${err.message}`);
    process.exit(1);
  }
}
