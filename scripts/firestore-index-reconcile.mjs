#!/usr/bin/env node
/**
 * Reconciles `firestore.indexes.json` against the indexes a Firestore database
 * actually has, and refuses to proceed if applying the manifest would remove one.
 *
 * WHY THIS EXISTS RATHER THAN `firebase deploy --only firestore:indexes`
 *
 * `firebase deploy` reconciles in both directions. Anything live that the manifest
 * does not describe goes on a delete list, and the only thing standing between that
 * list and the API is a prompt. Two properties of firebase-tools 13.35.1 make that
 * unsafe for this repository specifically:
 *
 *  1. `listIndexes` (lib/firestore/api.js) STRIPS `__name__` from every live index,
 *     while `indexMatchesSpec` compares `fields.length` exactly. A manifest entry
 *     that declares `__name__` therefore can never match a live index. 85 of this
 *     repository's 169 declared indexes declare it, so a deploy would queue each of
 *     them as a create AND its live counterpart as a delete.
 *  2. `--non-interactive` without `--force` does not silently delete — `confirm()`
 *     in lib/prompt.js throws instead. That is fail-closed, but it fails the whole
 *     deploy before the creation loop, so nothing gets created either.
 *
 * The result is that on this repository `firebase deploy` either aborts creating
 * nothing, or — with `--force` — deletes and recreates most of the live index set on
 * a project serving real tenants. Neither is an acceptable way to add eleven indexes.
 *
 * So this computes the difference explicitly, fails closed on any proposed removal,
 * and emits a create-only plan. Creates are then applied with
 * `gcloud firestore indexes composite create`, which has no capacity to delete.
 *
 * Nothing here talks to Google. It reads two JSON documents and compares them, which
 * is what makes it testable.
 */

/** The only database this repository targets. Named, not assumed. */
export const DEFAULT_DATABASE = '(default)';

/**
 * `__name__` is dropped before comparison ONLY when it is redundant.
 *
 * Firestore appends `__name__` to every composite index implicitly, in the same
 * direction as the last explicitly ordered field. A manifest that spells that out is
 * describing the same index as one that leaves it implicit, and this repository is
 * inconsistent about which style it uses — so comparing with it always included would
 * report indexes as missing purely because of how they were written down. That is the
 * trap firebase-tools falls into from the other side: `listIndexes` strips `__name__`
 * unconditionally while `indexMatchesSpec` compares `fields.length` exactly.
 *
 * But an explicit `__name__` whose direction DIFFERS from the implicit one is a
 * genuinely different index, and Firestore treats it as such. This manifest contains
 * two of them (projects on managerId/status, milestones on projectId/dueDate), so
 * dropping it unconditionally would silently conflate them with their neighbours.
 *
 * Redundant, therefore dropped. Contradictory, therefore kept.
 */
function significantFields(fields) {
  const all = fields || [];
  const rest = all.filter((field) => field.fieldPath !== '__name__');
  const named = all.filter((field) => field.fieldPath === '__name__');
  if (named.length === 0) return rest;

  const last = rest[rest.length - 1];
  const implicit =
    (last && (last.order || last.arrayConfig)) === 'DESCENDING' ? 'DESCENDING' : 'ASCENDING';
  const explicit = named[named.length - 1].order === 'DESCENDING' ? 'DESCENDING' : 'ASCENDING';

  return explicit === implicit ? rest : [...rest, { fieldPath: '__name__', order: explicit }];
}

/** Canonical, order-sensitive identity of an index. Field order is part of an index. */
export function indexKey(index) {
  const fields = significantFields(index.fields)
    .map((field) => `${field.fieldPath}:${field.order || field.arrayConfig || ''}`)
    .join(',');
  return `${index.collectionGroup}|${index.queryScope || 'COLLECTION'}|${fields}`;
}

/** Human-readable form for a report. */
export function describeIndex(index) {
  const fields = significantFields(index.fields)
    .map((field) => `${field.fieldPath} ${field.order || field.arrayConfig || ''}`.trim())
    .join(', ');
  return `${index.collectionGroup} (${index.queryScope || 'COLLECTION'}): ${fields}`;
}

/**
 * Manifest entries that collapse onto the same key once `__name__` is dropped.
 *
 * Two such entries are either a duplicate, or two genuinely distinct indexes that
 * this comparison cannot tell apart. Both are reasons to stop rather than guess.
 */
export function findKeyCollisions(indexes) {
  const seen = new Map();
  const collisions = [];
  for (const index of indexes) {
    const key = indexKey(index);
    if (seen.has(key)) {
      collisions.push({ key, indexes: [seen.get(key), index] });
    } else {
      seen.set(key, index);
    }
  }
  return collisions;
}

/**
 * Manifest entries, de-duplicated by identity.
 *
 * This repository declares six indexes twice — once with the implicit `__name__`
 * written out and once without. They describe the same index, so they are collapsed
 * here rather than being created twice. `findKeyCollisions` remains available for a
 * test to assert that every collision really is a duplicate and not something the
 * comparison has flattened by mistake.
 *
 * @param {{indexes?: unknown[]}} manifest — parsed firestore.indexes.json
 */
export function parseManifest(manifest) {
  const indexes = Array.isArray(manifest?.indexes) ? manifest.indexes : [];
  const normalized = indexes.map((index) => ({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope || 'COLLECTION',
    fields: index.fields || [],
  }));

  const seen = new Set();
  return normalized.filter((index) => {
    const key = indexKey(index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Live indexes as `gcloud firestore indexes composite list --format=json` reports
 * them. Unlike firebase-tools, gcloud does NOT strip `__name__`; `indexKey` does.
 *
 * The collection group and database are parsed out of the resource name:
 *   projects/P/databases/(default)/collectionGroups/CG/indexes/ID
 */
export function parseLiveIndexes(live) {
  const rows = Array.isArray(live) ? live : Array.isArray(live?.indexes) ? live.indexes : [];
  return rows.map((index) => {
    const match = /databases\/([^/]+)\/collectionGroups\/([^/]+)\/indexes\//.exec(index.name || '');
    return {
      collectionGroup: index.collectionGroup || (match ? match[2] : ''),
      database: match ? match[1] : '',
      queryScope: index.queryScope || 'COLLECTION',
      fields: index.fields || [],
      state: index.state || '',
      name: index.name || '',
    };
  });
}

/**
 * `missing` would be created, `extra` would be DELETED by a reconciling deploy, and
 * `matched` is already correct. Only `missing` is ever acted on.
 */
export function reconcile(manifestIndexes, liveIndexes) {
  const liveByKey = new Map(liveIndexes.map((index) => [indexKey(index), index]));
  const manifestByKey = new Map(manifestIndexes.map((index) => [indexKey(index), index]));

  const missing = manifestIndexes.filter((index) => !liveByKey.has(indexKey(index)));
  const extra = liveIndexes.filter((index) => !manifestByKey.has(indexKey(index)));
  const matched = manifestIndexes.filter((index) => liveByKey.has(indexKey(index)));

  return { missing, extra, matched };
}

/** Live indexes still building. A create that has not reached READY serves nothing. */
export function notReady(liveIndexes) {
  return liveIndexes.filter((index) => index.state && index.state !== 'READY');
}

/**
 * The safety gate. Anything live that the manifest does not describe is a deletion
 * candidate, and this run is not authorised to delete. Fail closed, and say exactly
 * what would have gone.
 */
export function assertNoDeletions({ extra }) {
  if (extra.length === 0) return;
  const listed = extra.map((index) => `  - ${describeIndex(index)}`).join('\n');
  throw new Error(
    `Refusing to proceed: ${extra.length} live index(es) are not described by ` +
      `firestore.indexes.json. A reconciling deploy would delete them.\n${listed}\n` +
      'Add them to the manifest, or have the owner approve their removal explicitly. ' +
      'This job never deletes.',
  );
}

/** Every index must belong to the database this repository targets. */
export function assertDefaultDatabase(liveIndexes) {
  const foreign = liveIndexes.filter(
    (index) => index.database && index.database !== DEFAULT_DATABASE,
  );
  if (foreign.length === 0) return;
  throw new Error(
    `Refusing to proceed: ${foreign.length} live index(es) belong to a database other ` +
      `than ${DEFAULT_DATABASE}: ${[...new Set(foreign.map((i) => i.database))].join(', ')}`,
  );
}

/**
 * The `gcloud firestore indexes composite create` arguments for one index.
 * Create-only by construction: this command cannot remove anything.
 */
export function createCommandArgs(index, { project, database = DEFAULT_DATABASE }) {
  const args = [
    'firestore',
    'indexes',
    'composite',
    'create',
    `--project=${project}`,
    `--database=${database}`,
    `--collection-group=${index.collectionGroup}`,
    `--query-scope=${index.queryScope || 'COLLECTION'}`,
  ];
  for (const field of significantFields(index.fields)) {
    args.push(
      field.arrayConfig
        ? `--field-config=field-path=${field.fieldPath},array-config=${field.arrayConfig.toLowerCase()}`
        : `--field-config=field-path=${field.fieldPath},order=${String(field.order).toLowerCase()}`,
    );
  }
  return args;
}

// ---------------------------------------------------------------------------
// CLI. Importable above, executable here: the entry point runs only when this
// file is the process's own argv[1], never when a suite imports the functions.
//
//   node scripts/firestore-index-reconcile.mjs \
//     --manifest firestore.indexes.json \
//     --live live-indexes.json \
//     --project la-creativo-erp \
//     [--plan create-plan.json]
//
// Exits non-zero on any condition that must stop a deploy. Prints a plan of
// creates; never a plan of deletes, because it cannot produce one.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function arg(argv, name) {
  const hit = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = argv.indexOf(`--${name}`);
  return at !== -1 ? argv[at + 1] : undefined;
}

export function runReconcile(argv, { log = console.log, error = console.error } = {}) {
  const manifestPath = arg(argv, 'manifest') || 'firestore.indexes.json';
  const livePath = arg(argv, 'live');
  const project = arg(argv, 'project');
  const planPath = arg(argv, 'plan');

  if (!livePath) throw new Error('--live <file> is required (the live inventory JSON)');
  if (!project) throw new Error('--project <id> is required');

  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const live = parseLiveIndexes(JSON.parse(readFileSync(livePath, 'utf8')));

  assertDefaultDatabase(live);

  const result = reconcile(manifest, live);

  log(`manifest indexes : ${manifest.length}`);
  log(`live indexes     : ${live.length}`);
  log(`already present  : ${result.matched.length}`);
  log(`to create        : ${result.missing.length}`);
  log(`unaccounted live : ${result.extra.length}`);

  const building = notReady(live);
  if (building.length) {
    log(`\nlive indexes not yet READY (${building.length}):`);
    for (const index of building) log(`  - ${describeIndex(index)} [${index.state}]`);
  }

  if (result.missing.length) {
    // Capped: on a project whose indexes were never deployed this list is the whole
    // manifest, and a hundred-and-sixty-line wall buries the reconciliation summary
    // and the failure reason underneath it. The full set is in the plan artifact.
    const shown = result.missing.slice(0, 25);
    log(`\nwould create (${result.missing.length}):`);
    for (const index of shown) log(`  + ${describeIndex(index)}`);
    if (result.missing.length > shown.length) {
      log(`  ... and ${result.missing.length - shown.length} more (see the create plan artifact)`);
    }
  }

  // Fails the run rather than letting a deploy decide. Printed after the summary so
  // the operator sees the whole picture alongside the reason for stopping.
  assertNoDeletions(result);

  if (planPath) {
    const plan = result.missing.map((index) => ({
      index: describeIndex(index),
      args: createCommandArgs(index, { project }),
    }));
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    log(`\ncreate plan written to ${planPath} (${plan.length} command(s))`);
  }

  return result;
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  try {
    runReconcile(process.argv.slice(2));
  } catch (err) {
    console.error(`\nReconciliation failed.\n  ${err.message}`);
    process.exit(1);
  }
}
