#!/usr/bin/env node
/**
 * Applies a create-only index plan produced by `firestore-index-reconcile.mjs`.
 *
 * WHY THIS DOES NOT TRUST THE PLAN'S COMMAND LINE
 *
 * An earlier revision stored a ready-made argv per index and validated it with a
 * prefix check and a short denylist. Review found the hole: the verb was constrained
 * but the resource and credential boundary was not. A plan carrying an extra
 * `--project`, a fully-qualified cross-project resource name,
 * `--impersonate-service-account` or `--flags-file` would have passed, and gcloud
 * resolves a repeated flag to its LAST occurrence — so an appended `--project=other`
 * silently wins.
 *
 * So the plan no longer contains a command line at all. It contains index
 * DEFINITIONS, each validated against a strict schema here, and this module builds
 * the argv itself from those fields plus a project and database supplied on its own
 * command line. There is no path by which plan content becomes a flag.
 *
 * Every command is spawned with an explicit argv array, never through a shell, so
 * word-splitting and quoting cannot turn one argument into two.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** The only project this repository deploys indexes to. */
export const ALLOWED_PROJECT = 'la-creativo-erp';
/** The only database. Firestore's default; named rather than assumed. */
export const ALLOWED_DATABASE = '(default)';

const ALLOWED_QUERY_SCOPES = new Set(['COLLECTION', 'COLLECTION_GROUP']);
const ALLOWED_ORDERS = new Set(['ASCENDING', 'DESCENDING']);
const ALLOWED_ARRAY_CONFIGS = new Set(['CONTAINS']);

/**
 * Collection groups and field paths are interpolated into `--field-config=` and
 * `--collection-group=`, so they are constrained to characters that cannot end a
 * flag or begin another. `__name__` is permitted because Firestore uses it; a
 * fully-qualified resource path is not, because `/` is how a cross-project name
 * would be smuggled in.
 */
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const SAFE_FIELD_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/**
 * Validates one index definition and returns a normalised copy.
 * Throws with the offending value rather than a generic message.
 */
export function validateIndexDefinition(definition, position = 0) {
  const where = `Plan index ${position}`;
  if (!definition || typeof definition !== 'object') {
    throw new Error(`${where} is not an object.`);
  }

  const { collectionGroup, queryScope, fields } = definition;

  if (typeof collectionGroup !== 'string' || !SAFE_NAME.test(collectionGroup)) {
    throw new Error(
      `${where} has an unacceptable collection group: ${JSON.stringify(collectionGroup)}`,
    );
  }
  if (!ALLOWED_QUERY_SCOPES.has(queryScope)) {
    throw new Error(`${where} has an unacceptable query scope: ${JSON.stringify(queryScope)}`);
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error(`${where} has no fields.`);
  }

  const normalised = fields.map((field, fieldPosition) => {
    const at = `${where} field ${fieldPosition}`;
    if (!field || typeof field !== 'object') throw new Error(`${at} is not an object.`);
    if (typeof field.fieldPath !== 'string' || !SAFE_FIELD_PATH.test(field.fieldPath)) {
      throw new Error(`${at} has an unacceptable field path: ${JSON.stringify(field.fieldPath)}`);
    }
    if (field.arrayConfig !== undefined) {
      if (!ALLOWED_ARRAY_CONFIGS.has(field.arrayConfig)) {
        throw new Error(
          `${at} has an unacceptable array config: ${JSON.stringify(field.arrayConfig)}`,
        );
      }
      if (field.order !== undefined) {
        throw new Error(`${at} sets both order and arrayConfig.`);
      }
      return { fieldPath: field.fieldPath, arrayConfig: field.arrayConfig };
    }
    if (!ALLOWED_ORDERS.has(field.order)) {
      throw new Error(`${at} has an unacceptable order: ${JSON.stringify(field.order)}`);
    }
    return { fieldPath: field.fieldPath, order: field.order };
  });

  return { collectionGroup, queryScope, fields: normalised };
}

/**
 * The whole plan: target, manifest binding, and index definitions.
 *
 * The project and database are checked against the constants above rather than
 * merely being present, so a plan for a different project cannot be applied here
 * even if it is otherwise well-formed.
 */
export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Create plan must be an object.');
  }
  if (plan.project !== ALLOWED_PROJECT) {
    throw new Error(`Create plan targets ${JSON.stringify(plan.project)}, not ${ALLOWED_PROJECT}.`);
  }
  if (plan.database !== ALLOWED_DATABASE) {
    throw new Error(
      `Create plan targets database ${JSON.stringify(plan.database)}, not ${ALLOWED_DATABASE}.`,
    );
  }
  if (typeof plan.manifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(plan.manifestSha256)) {
    throw new Error('Create plan does not carry a manifest sha256.');
  }
  if (!Array.isArray(plan.indexes)) {
    throw new Error('Create plan has no indexes array.');
  }
  return {
    ...plan,
    indexes: plan.indexes.map((definition, position) =>
      validateIndexDefinition(definition, position),
    ),
  };
}

/**
 * Builds the gcloud argv for one validated definition.
 *
 * Nothing from the plan reaches this as a flag: the project and database come from
 * this module's own arguments, and every interpolated value has already been
 * constrained to a safe character set.
 */
export function buildCreateArgs(definition, { project, database }) {
  if (project !== ALLOWED_PROJECT) throw new Error(`Refusing to target project ${project}.`);
  if (database !== ALLOWED_DATABASE) throw new Error(`Refusing to target database ${database}.`);

  const args = [
    'firestore',
    'indexes',
    'composite',
    'create',
    `--project=${project}`,
    `--database=${database}`,
    `--collection-group=${definition.collectionGroup}`,
    `--query-scope=${definition.queryScope}`,
  ];
  for (const field of definition.fields) {
    args.push(
      field.arrayConfig
        ? `--field-config=field-path=${field.fieldPath},array-config=${field.arrayConfig.toLowerCase()}`
        : `--field-config=field-path=${field.fieldPath},order=${field.order.toLowerCase()}`,
    );
  }
  return args;
}

/** Digest of the exact plan bytes, so an approval can name what it approved. */
export function planDigest(serialized) {
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * @param {string} serializedPlan raw plan JSON, as written by the reconciler
 * @param {{project: string, database: string, expectDigest?: string}} target
 * @param {{run?: Function, log?: Function}} io
 */
export function applyPlan(serializedPlan, target, io = {}) {
  const run =
    io.run ||
    ((cmd, args) =>
      spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' }));
  const log = io.log || console.log;

  const digest = planDigest(serializedPlan);
  if (target.expectDigest && target.expectDigest !== digest) {
    // The plan the owner approved is not the plan about to run. Refuse rather than
    // apply something nobody looked at.
    throw new Error(
      `Plan digest ${digest} does not match the approved digest ${target.expectDigest}. ` +
        'Re-run the plan job and approve the result it produces.',
    );
  }

  const plan = validatePlan(JSON.parse(serializedPlan));
  log(`plan digest     : ${digest}`);
  log(`manifest sha256 : ${plan.manifestSha256}`);

  if (plan.indexes.length === 0) {
    log('Nothing to create; live already matches the manifest.');
    return { created: 0, digest };
  }

  log(`Creating ${plan.indexes.length} index(es) in ${target.project}/${target.database}.`);
  let created = 0;
  for (const definition of plan.indexes) {
    const args = buildCreateArgs(definition, target);
    log(`  + ${args.join(' ')}`);
    // `--async` returns once the create is accepted; readiness is waited on separately.
    const result = run('gcloud', [...args, '--async']);
    if (result.status !== 0) {
      throw new Error(
        `gcloud exited ${result.status} for: ${args.join(' ')}\n${result.stderr || ''}`.trim(),
      );
    }
    created += 1;
  }
  return { created, digest };
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
    const argv = process.argv.slice(2);
    const planPath = arg(argv, 'plan') || 'create-plan.json';
    applyPlan(readFileSync(planPath, 'utf8'), {
      project: arg(argv, 'project') || ALLOWED_PROJECT,
      database: arg(argv, 'database') || ALLOWED_DATABASE,
      expectDigest: arg(argv, 'expect-digest'),
    });
  } catch (err) {
    console.error(`\nIndex apply failed.\n  ${err.message}`);
    process.exit(1);
  }
}
