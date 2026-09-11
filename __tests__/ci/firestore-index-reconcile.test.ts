/**
 * The safety properties of the Firestore index deploy, tested rather than asserted.
 *
 * The review this suite answers made one point that turned out to be exactly right:
 * a manifest that is additive relative to Git is not additive relative to a live
 * database. `firebase deploy --only firestore:indexes` reconciles in BOTH directions,
 * and on this repository it would propose deleting most of the live index set —
 * because firebase-tools strips `__name__` when reading live indexes
 * (lib/firestore/api.js listIndexes) while comparing `fields.length` exactly, and 85
 * of the 169 declared indexes spell `__name__` out.
 *
 * So the deploy path here computes the difference itself, refuses to run if anything
 * live is unaccounted for, and only ever creates. These tests are what make that a
 * property rather than a claim.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  assertDefaultDatabase,
  assertNoDeletions,
  describeIndex,
  findKeyCollisions,
  indexKey,
  notReady,
  parseLiveIndexes,
  parseManifest,
  reconcile,
  runReconcile,
  sha256,
  decodeSegment,
} from '@/scripts/firestore-index-reconcile.mjs';
import { applyPlan, planDigest } from '@/scripts/firestore-index-apply.mjs';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const A = 'ASCENDING';
const D = 'DESCENDING';

type Field = { fieldPath: string; order?: string; arrayConfig?: string };
/** Shape the .mjs module returns; TypeScript infers it too loosely across the JS boundary. */
type Indexish = { collectionGroup: string };
/** Raw manifest entry, before normalisation. */
type RawIndex = { collectionGroup: string; queryScope?: string; fields?: Field[] };
const idx = (collectionGroup: string, fields: Field[], queryScope = 'COLLECTION') => ({
  collectionGroup,
  queryScope,
  fields,
});

/** A live index as gcloud reports it — including the `__name__` gcloud does not strip. */
const liveIdx = (collectionGroup: string, fields: Field[], state = 'READY') => ({
  name: `projects/p/databases/(default)/collectionGroups/${collectionGroup}/indexes/ix_${collectionGroup}_${fields.map((f) => f.fieldPath).join('_')}`,
  queryScope: 'COLLECTION',
  state,
  fields: [...fields, { fieldPath: '__name__', order: fields[fields.length - 1]?.order || A }],
});

describe('index identity', () => {
  it('ignores a REDUNDANT __name__ — the direction Firestore would append anyway', () => {
    const declared = idx('leads', [
      { fieldPath: 'tenantId', order: A },
      { fieldPath: 'createdAt', order: D },
      { fieldPath: '__name__', order: D }, // same as the last field: implicit
    ]);
    const withoutIt = idx('leads', [
      { fieldPath: 'tenantId', order: A },
      { fieldPath: 'createdAt', order: D },
    ]);
    expect(indexKey(declared)).toBe(indexKey(withoutIt));
  });

  it('keeps a CONTRADICTORY __name__, which is a genuinely different index', () => {
    // Firestore appends __name__ in the last field's direction. Stating the opposite
    // asks for a different index, and this manifest contains two such entries.
    // Dropping __name__ unconditionally would have conflated them with their
    // neighbours — which is precisely the bug firebase-tools has from the other side.
    const implicitAsc = idx('projects', [
      { fieldPath: 'managerId', order: A },
      { fieldPath: 'status', order: A },
    ]);
    const explicitDesc = idx('projects', [
      { fieldPath: 'managerId', order: A },
      { fieldPath: 'status', order: A },
      { fieldPath: '__name__', order: D },
    ]);
    expect(indexKey(explicitDesc)).not.toBe(indexKey(implicitAsc));
  });

  it('treats field ORDER as part of the index, because Firestore does', () => {
    const a = idx('deals', [
      { fieldPath: 'tenantId', order: A },
      { fieldPath: 'status', order: A },
    ]);
    const b = idx('deals', [
      { fieldPath: 'status', order: A },
      { fieldPath: 'tenantId', order: A },
    ]);
    expect(indexKey(a)).not.toBe(indexKey(b));
  });

  it('treats direction and array-contains as significant', () => {
    const asc = idx('deals', [{ fieldPath: 'createdAt', order: A }]);
    const desc = idx('deals', [{ fieldPath: 'createdAt', order: D }]);
    const contains = idx('deals', [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }]);
    expect(indexKey(asc)).not.toBe(indexKey(desc));
    expect(indexKey(contains)).not.toBe(indexKey(asc));
  });

  it('treats collection group and query scope as significant', () => {
    const fields = [{ fieldPath: 'tenantId', order: A }];
    expect(indexKey(idx('a', fields))).not.toBe(indexKey(idx('b', fields)));
    expect(indexKey(idx('a', fields))).not.toBe(indexKey(idx('a', fields, 'COLLECTION_GROUP')));
  });
});

describe('reconciliation', () => {
  const manifest = [
    idx('leads', [
      { fieldPath: 'tenantId', order: A },
      { fieldPath: 'createdAt', order: D },
    ]),
    idx('projects', [
      { fieldPath: 'clientId', order: A },
      { fieldPath: 'tenantId', order: A },
      { fieldPath: 'isDeleted', order: A },
      { fieldPath: 'updatedAt', order: D },
    ]),
  ];

  it('matches a declared index against its live counterpart despite __name__', () => {
    const live = parseLiveIndexes([
      liveIdx('leads', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'createdAt', order: D },
      ]),
    ]);
    const result = reconcile(manifest, live);
    expect(result.matched.map((i: Indexish) => i.collectionGroup)).toEqual(['leads']);
    expect(result.missing.map((i: Indexish) => i.collectionGroup)).toEqual(['projects']);
    expect(result.extra).toEqual([]);
  });

  it('reports a live index the manifest does not describe as `extra`, never as safe', () => {
    const live = parseLiveIndexes([
      liveIdx('invoices', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'dueDate', order: A },
      ]),
    ]);
    const result = reconcile(manifest, live);
    expect(result.extra).toHaveLength(1);
    expect(result.extra[0].collectionGroup).toBe('invoices');
  });
});

describe('no live index can be deleted without explicit approval', () => {
  it('fails closed when anything live is unaccounted for', () => {
    const result = reconcile(
      [idx('leads', [{ fieldPath: 'tenantId', order: A }])],
      parseLiveIndexes([
        liveIdx('leads', [{ fieldPath: 'tenantId', order: A }]),
        liveIdx('invoices', [{ fieldPath: 'tenantId', order: A }]),
      ]),
    );
    expect(() => assertNoDeletions(result)).toThrow(/Refusing to proceed/);
    // The operator is told exactly what would have gone, not just that something would.
    expect(() => assertNoDeletions(result)).toThrow(/invoices/);
    expect(() => assertNoDeletions(result)).toThrow(/never deletes/);
  });

  it('permits the run only when every live index is described', () => {
    const result = reconcile(
      [
        idx('leads', [{ fieldPath: 'tenantId', order: A }]),
        idx('projects', [{ fieldPath: 'tenantId', order: A }]),
      ],
      parseLiveIndexes([liveIdx('leads', [{ fieldPath: 'tenantId', order: A }])]),
    );
    expect(() => assertNoDeletions(result)).not.toThrow();
    expect(result.missing).toHaveLength(1);
  });

  it('an empty live inventory is treated as "everything missing", never as "nothing to keep"', () => {
    // A credential that cannot read indexes would return an empty list. That must not
    // read as permission to delete, and it must not silently look like a clean slate.
    const result = reconcile(
      parseManifest({ indexes: [idx('leads', [{ fieldPath: 'x', order: A }])] }),
      [],
    );
    expect(result.extra).toEqual([]);
    expect(result.missing).toHaveLength(1);
    expect(() => assertNoDeletions(result)).not.toThrow();
  });
});

describe('database scope', () => {
  it('refuses indexes belonging to a database other than the default', () => {
    const live = parseLiveIndexes([
      {
        name: 'projects/p/databases/analytics/collectionGroups/leads/indexes/ix',
        queryScope: 'COLLECTION',
        state: 'READY',
        fields: [{ fieldPath: 'tenantId', order: A }],
      },
    ]);
    expect(() => assertDefaultDatabase(live)).toThrow(/other than \(default\)/);
  });

  it('accepts the default database', () => {
    const live = parseLiveIndexes([liveIdx('leads', [{ fieldPath: 'tenantId', order: A }])]);
    expect(() => assertDefaultDatabase(live)).not.toThrow();
  });
});

describe('readiness', () => {
  it('reports indexes that are not READY, because a building index serves no query', () => {
    const live = parseLiveIndexes([
      liveIdx('leads', [{ fieldPath: 'tenantId', order: A }], 'CREATING'),
      liveIdx('deals', [{ fieldPath: 'tenantId', order: A }], 'READY'),
    ]);
    expect(notReady(live).map((i: Indexish) => i.collectionGroup)).toEqual(['leads']);
  });
});

describe('this repository’s actual manifest', () => {
  const manifest = parseManifest(JSON.parse(read('firestore.indexes.json')));

  it('parses, and every entry names a collection group and fields', () => {
    expect(manifest.length).toBeGreaterThan(150);
    for (const index of manifest) {
      expect(typeof index.collectionGroup).toBe('string');
      expect(index.collectionGroup.length).toBeGreaterThan(0);
      expect(index.fields.length).toBeGreaterThan(0);
    }
  });

  it('de-duplicates entries that describe the same index two ways', () => {
    // Six indexes are declared twice here — once with the implicit __name__ written
    // out, once without. parseManifest collapses them, so each is created once.
    const raw = JSON.parse(read('firestore.indexes.json')).indexes as unknown[];
    expect(raw.length).toBeGreaterThan(manifest.length);
    expect(findKeyCollisions(manifest)).toEqual([]);
  });

  it('declares projects(managerId) and milestones(dueDate) once, in the implicit form', () => {
    // An earlier revision of this suite asserted the OPPOSITE: that these two kept an
    // explicit `__name__ DESCENDING` because the direction was deliberate. The first
    // verified production inventory (run 34442383509) falsified that premise — neither
    // the ascending nor the descending form of either index exists in la-creativo-erp —
    // and no query asks for them: `managerId` is only ever filtered on `clients` and
    // `users`, never `projects`, and the milestones read in the gantt route filters
    // tenantId and projectId without ordering by dueDate at all.
    //
    // So the descending variants were dropped as stale rather than kept as deliberate.
    // The comparison rule they were standing in for — that a CONTRADICTORY `__name__` is
    // a genuinely different index and must not be folded into its neighbour — is a
    // property of `indexKey` and is tested directly further up; it does not need a live
    // manifest entry to demonstrate it.
    const keys = manifest.map(indexKey);
    for (const fields of [
      [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'managerId', order: A },
        { fieldPath: 'status', order: A },
      ],
      [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'projectId', order: A },
        { fieldPath: 'dueDate', order: A },
      ],
    ]) {
      const collectionGroup = fields[1].fieldPath === 'managerId' ? 'projects' : 'milestones';
      const implicit = indexKey(idx(collectionGroup, fields));
      const contradictory = indexKey(
        idx(collectionGroup, [...fields, { fieldPath: '__name__', order: D }]),
      );

      expect(keys.filter((key) => key === implicit)).toHaveLength(1);
      expect(keys).not.toContain(contradictory);
    }
  });

  it('declares the indexes the PR6 certification suite proved were missing', () => {
    const keys = new Set(manifest.map(indexKey));
    const required = [
      idx('activity_presence', [
        { fieldPath: 'online', order: A },
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'lastSeenAt', order: D },
      ]),
      idx('projects', [
        { fieldPath: 'clientId', order: A },
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'isDeleted', order: A },
        { fieldPath: 'updatedAt', order: D },
      ]),
      idx('activities', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'createdAt', order: D },
      ]),
    ];
    for (const index of required) {
      expect(keys.has(indexKey(index))).toBe(true);
    }
  });

  it('uses activity_presence, the collection the presence query actually reads', () => {
    // The presence query lives in lib/activity/activity-service.ts and runs against
    // `activity_presence`. An earlier revision of this work put the index on
    // `activities`, which would have left the endpoint failing.
    const service = read('lib/activity/activity-service.ts');
    expect(service).toContain("PRESENCE_COLLECTION = 'activity_presence'");
    expect(manifest.some((i) => i.collectionGroup === 'activity_presence')).toBe(true);
  });
});

/**
 * The CLI orchestration, which the tests above deliberately did not reach.
 *
 * Everything above exercises the pure comparison functions. `runReconcile` is the
 * function that actually WRITES `create-plan.json`, and the whole approval model rests
 * on what it puts there: the deploy job binds its write to this file's digest, and
 * `firestore-index-apply.mjs` re-validates the contents before spawning anything. Two
 * properties in particular were untested and are the reason this block exists.
 *
 * The first is an ORDERING property. `assertNoDeletions` is called before the plan is
 * written, so a run that must fail closed leaves no plan behind at all. If those two
 * steps were ever swapped, a reconciliation that should have stopped would still have
 * produced an approvable artifact — the failure would be recorded, but the plan would
 * exist and could be fed to the applier. Asserting the throw is not enough; the absence
 * of the file is the property.
 *
 * The second is the CROSS-SCRIPT DIGEST SEAM. The workflow computes the approved digest
 * by hashing the plan file's bytes, while the applier hashes the string it reads back.
 * Those are two independent implementations of "the same plan", and if they ever
 * disagreed the binding in property E would be vacuous — the deploy would either fail
 * on every run or, worse, compare two things that are never equal and be dropped. So
 * the round trip is driven here end to end rather than assumed.
 */
describe('runReconcile — the plan that the approval binds to', () => {
  const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'firestore-index-reconcile-'));

  /** A manifest and live inventory written to disk, as the workflow supplies them. */
  const scenario = (manifestIndexes: unknown[], liveRows: unknown[]) => {
    const dir = tmp();
    const manifestPath = path.join(dir, 'firestore.indexes.json');
    const livePath = path.join(dir, 'live-indexes.json');
    const planPath = path.join(dir, 'create-plan.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ indexes: manifestIndexes }, null, 2)}\n`);
    fs.writeFileSync(livePath, JSON.stringify(liveRows, null, 2));
    return { dir, manifestPath, livePath, planPath };
  };

  const argv = (s: ReturnType<typeof scenario>): string[] => [
    '--manifest',
    s.manifestPath,
    '--live',
    s.livePath,
    '--project',
    'la-creativo-erp',
    '--plan',
    s.planPath,
  ];

  const silent = { log: () => {}, error: () => {} };

  const LEADS = idx('leads', [
    { fieldPath: 'tenantId', order: A },
    { fieldPath: 'createdAt', order: D },
  ]);
  const PROJECTS = idx('projects', [
    { fieldPath: 'tenantId', order: A },
    { fieldPath: 'status', order: A },
  ]);

  it('requires the live inventory and the project, rather than defaulting them', () => {
    // A default here would mean reconciling against nothing, which reads as
    // "everything is missing" — the most destructive possible starting point.
    expect(() => runReconcile(['--project', 'la-creativo-erp'], silent)).toThrow(/--live/);
    expect(() => runReconcile(['--live', 'x.json'], silent)).toThrow(/--project/);
  });

  it('writes a plan containing ONLY the indexes that are missing', () => {
    const s = scenario(
      [LEADS, PROJECTS],
      [
        liveIdx('leads', [
          { fieldPath: 'tenantId', order: A },
          { fieldPath: 'createdAt', order: D },
        ]),
      ],
    );

    runReconcile(argv(s), silent);
    const plan = JSON.parse(fs.readFileSync(s.planPath, 'utf8'));

    // `leads` is already live; only `projects` may be created.
    expect(plan.indexes).toHaveLength(1);
    expect(plan.indexes[0].collectionGroup).toBe('projects');
  });

  it('ties the plan to the exact manifest bytes it was computed from', () => {
    const s = scenario([LEADS], []);
    runReconcile(argv(s), silent);
    const plan = JSON.parse(fs.readFileSync(s.planPath, 'utf8'));

    // An approval must not be transferable to a different manifest.
    expect(plan.manifestSha256).toBe(sha256(fs.readFileSync(s.manifestPath)));
  });

  it('names the target explicitly, so the applier can refuse a foreign plan', () => {
    const s = scenario([LEADS], []);
    runReconcile(argv(s), silent);
    const plan = JSON.parse(fs.readFileSync(s.planPath, 'utf8'));

    expect(plan.project).toBe('la-creativo-erp');
    expect(plan.database).toBe('(default)');
  });

  it('writes NO plan at all when a live index is unaccounted for', () => {
    // The ordering property: fail closed before the artifact exists, not after.
    // A plan written and then abandoned is still a plan someone can approve.
    const s = scenario(
      [LEADS],
      [
        liveIdx('leads', [
          { fieldPath: 'tenantId', order: A },
          { fieldPath: 'createdAt', order: D },
        ]),
        liveIdx('secrets', [{ fieldPath: 'ownerId', order: A }]),
      ],
    );

    expect(() => runReconcile(argv(s), silent)).toThrow(/Refusing to proceed/);
    expect(fs.existsSync(s.planPath)).toBe(false);
  });

  it('refuses before writing a plan when a foreign database appears', () => {
    const s = scenario([LEADS], []);
    fs.writeFileSync(
      s.livePath,
      JSON.stringify([
        {
          name: 'projects/p/databases/analytics/collectionGroups/leads/indexes/ix1',
          queryScope: 'COLLECTION',
          state: 'READY',
          fields: [{ fieldPath: 'tenantId', order: A }],
        },
      ]),
    );

    expect(() => runReconcile(argv(s), silent)).toThrow(/database other than/);
    expect(fs.existsSync(s.planPath)).toBe(false);
  });

  it('produces a plan the applier accepts, digest and all, without a shell', () => {
    // The seam between the two scripts. The workflow hashes the plan FILE; the applier
    // hashes the string it reads back. This drives that exact round trip so the two
    // cannot silently diverge and leave the approval binding comparing nothing.
    const s = scenario([LEADS, PROJECTS], []);
    runReconcile(argv(s), silent);

    const bytes = fs.readFileSync(s.planPath);
    const workflowDigest = sha256(bytes); // what the inventory job publishes
    const serialized = fs.readFileSync(s.planPath, 'utf8');
    expect(planDigest(serialized)).toBe(workflowDigest);

    const spawned: string[][] = [];
    const result = applyPlan(
      serialized,
      { project: 'la-creativo-erp', database: '(default)', expectDigest: workflowDigest },
      {
        log: () => {},
        run: (_cmd: string, args: string[]) => {
          spawned.push(args);
          return { status: 0, stderr: '' };
        },
      },
    );

    expect(result.created).toBe(2);
    // Every spawned command creates; none can delete, and the target is fixed.
    for (const args of spawned) {
      expect(args.slice(0, 4)).toEqual(['firestore', 'indexes', 'composite', 'create']);
      expect(args).toContain('--project=la-creativo-erp');
      expect(args).toContain('--database=(default)');
      expect(args.filter((a) => a.startsWith('--project='))).toHaveLength(1);
    }
  });

  it('fails the applier when the plan is regenerated differently after approval', () => {
    // Property E, driven through both scripts: approve one plan, then let live state
    // change so the reconciler produces a different one. The write must not proceed.
    const s = scenario([LEADS, PROJECTS], []);
    runReconcile(argv(s), silent);
    const approvedDigest = sha256(fs.readFileSync(s.planPath));

    // Someone creates `leads` by hand between the approval and the deploy.
    fs.writeFileSync(
      s.livePath,
      JSON.stringify([
        liveIdx('leads', [
          { fieldPath: 'tenantId', order: A },
          { fieldPath: 'createdAt', order: D },
        ]),
      ]),
    );
    runReconcile(argv(s), silent);

    expect(() =>
      applyPlan(
        fs.readFileSync(s.planPath, 'utf8'),
        { project: 'la-creativo-erp', database: '(default)', expectDigest: approvedDigest },
        { log: () => {}, run: () => ({ status: 0, stderr: '' }) },
      ),
    ).toThrow(/does not match the approved digest/);
  });
});

/**
 * Reconciliation against the FIRST VERIFIED PRODUCTION INVENTORY.
 *
 * On 2026-09-10 the read-only inventory job ran against la-creativo-erp for the first
 * time (GitHub Actions run 34442383509) and reported 144 live indexes, 104 already
 * present, 59 to create and 40 unaccounted for. The forty below are that result, copied
 * verbatim from the reconciler's own fail-closed output, and they are the reason this
 * block exists: a manifest that does not describe them can never reach a clean state, and
 * `assertNoDeletions` refuses every future run until it does.
 *
 * Twenty-two of the forty were not missing at all. The manifest declared the same index
 * with an explicit `__name__ DESCENDING` while the last ordered field was ASCENDING — a
 * direction Firestore never appends implicitly — so each one simultaneously proposed a
 * create production did not need and orphaned the live index production actually had.
 * That is one systematic defect, and it predates this PR: all twenty-six such entries
 * are present on main.
 *
 * These pin the outcome against the real evidence rather than a synthetic example.
 */
describe('the verified production inventory of 2026-09-10', () => {
  /** The 40 live indexes the first real inventory reported as unaccounted for. */
  const UNACCOUNTED: Array<[string, Field[]]> = [
    [
      'taxRates',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isActive', order: 'ASCENDING' },
      ],
    ],
    [
      'recurringInvoiceTemplates',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'frequency', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'hr_performance',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'reviewerId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'recurringInvoiceTemplates',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'nextRunDate', order: 'ASCENDING' },
      ],
    ],
    [
      'clients',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'salesOwner', order: 'ASCENDING' },
        { fieldPath: 'createdAt', order: 'DESCENDING' },
      ],
    ],
    [
      'expenses',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
      ],
    ],
    [
      'productionTimeEntries',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'projectId', order: 'ASCENDING' },
        { fieldPath: 'userId', order: 'ASCENDING' },
      ],
    ],
    [
      'invoices%20',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'dueDate', order: 'DESCENDING' },
      ],
    ],
    [
      'invoices',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'dueDate', order: 'ASCENDING' },
        { fieldPath: 'isPaid', order: 'ASCENDING' },
      ],
    ],
    [
      'webhook_subscriptions',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'createdAt', order: 'DESCENDING' },
      ],
    ],
    [
      'hr_leaveRequests',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'approverId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'invoices',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'users',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'role', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'production_jobs',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'completedAt', order: 'ASCENDING' },
        { fieldPath: 'completedBy', order: 'ASCENDING' },
      ],
    ],
    [
      'payments',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
      ],
    ],
    [
      'followUps',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
        { fieldPath: 'assignedTo', order: 'ASCENDING' },
      ],
    ],
    [
      'deals',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'assignedTo', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'files',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
      ],
    ],
    [
      'payroll',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
      ],
    ],
    [
      'billing_invoices',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'createdAt', order: 'DESCENDING' },
      ],
    ],
    [
      'production_jobs',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'assignedTo', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'invoices',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
      ],
    ],
    [
      'projects',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'teamMemberIds', arrayConfig: 'CONTAINS' },
        { fieldPath: 'createdAt', order: 'ASCENDING' },
      ],
    ],
    [
      'projects',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'assignedTo', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'email_templates',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'updatedAt', order: 'DESCENDING' },
      ],
    ],
    [
      'followUps',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
        { fieldPath: 'createdBy', order: 'ASCENDING' },
      ],
    ],
    [
      'tasks',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'projectId', order: 'ASCENDING' },
        { fieldPath: 'assignedTo', order: 'ASCENDING' },
      ],
    ],
    [
      'tasks',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'projectId', order: 'ASCENDING' },
        { fieldPath: 'dueDate', order: 'ASCENDING' },
      ],
    ],
    [
      'user_invitations',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'invoices',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isRecurring', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'hr_leaveRequests',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'startDate', order: 'ASCENDING' },
      ],
    ],
    [
      'hr_leaveRequests',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'employeeId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'hr_employees',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'employmentType', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'invoices',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'clientId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'milestones',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'projectId', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'hr_timeEntries',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'projectId', order: 'ASCENDING' },
        { fieldPath: 'employeeId', order: 'ASCENDING' },
      ],
    ],
    [
      'campaigns',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'isDeleted', order: 'ASCENDING' },
        { fieldPath: 'createdBy', order: 'ASCENDING' },
      ],
    ],
    [
      'taxRates',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'region', order: 'ASCENDING' },
        { fieldPath: 'isActive', order: 'ASCENDING' },
      ],
    ],
    [
      'hr_employees',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'department', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
    [
      'projects',
      [
        { fieldPath: 'tenantId', order: 'ASCENDING' },
        { fieldPath: 'dueDate', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    ],
  ];

  const liveManifest = parseManifest(JSON.parse(read('firestore.indexes.json')));

  /** As gcloud reports them: percent-encoded name segment, implicit __name__ appended. */
  const asLiveRow = (collectionGroup: string, fields: Field[], i = 0) => {
    const last = fields[fields.length - 1];
    return {
      name:
        'projects/la-creativo-erp/databases/(default)/collectionGroups/' +
        collectionGroup +
        '/indexes/ix' +
        i,
      queryScope: 'COLLECTION',
      state: 'READY',
      fields: [...fields, { fieldPath: '__name__', order: last.order === D ? D : A }],
    };
  };

  it('describes every one of the 40 live indexes that were unaccounted for', () => {
    const live = parseLiveIndexes(UNACCOUNTED.map(([cg, fields], i) => asLiveRow(cg, fields, i)));
    const { extra } = reconcile(liveManifest, live);

    // Non-zero here means the next owner inventory fails closed again, naming these.
    expect(extra.map((index: Indexish) => describeIndex(index))).toEqual([]);
  });

  it('declares no index whose __name__ contradicts the direction Firestore appends', () => {
    // The defect class that produced 22 of the 40. An explicit __name__ is only
    // meaningful when it DIFFERS from the implicit one, and every entry that differed
    // described an index production does not have and no query asks for.
    const raw = JSON.parse(read('firestore.indexes.json')).indexes as RawIndex[];
    const offenders = raw
      .filter((index) => {
        const fields = index.fields || [];
        const named = fields.find((f) => f.fieldPath === '__name__');
        if (!named) return false;
        const rest = fields.filter((f) => f.fieldPath !== '__name__');
        const last = rest[rest.length - 1];
        const implicit = (last && (last.order || last.arrayConfig)) === D ? D : A;
        return named.order !== implicit;
      })
      .map(
        (index) =>
          index.collectionGroup + ': ' + (index.fields || []).map((f) => f.fieldPath).join(', '),
      );

    expect(offenders).toEqual([]);
  });

  it('reads a percent-encoded collection group as the id it actually encodes', () => {
    // Production contains `collectionGroups/invoices%20` — a collection group whose id
    // ends in a space. Compared without decoding it is the literal string "invoices%20",
    // matches nothing, and stays unaccounted for permanently.
    const [row] = parseLiveIndexes([
      asLiveRow('invoices%20', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'status', order: A },
        { fieldPath: 'dueDate', order: D },
      ]),
    ]);

    expect(row.collectionGroup).toBe('invoices ');
    expect(row.collectionGroup).not.toBe('invoices');
  });

  it('leaves an undecodable name alone instead of throwing on the whole inventory', () => {
    // decodeURIComponent raises URIError on a stray '%'. A live inventory is not
    // something to crash on: the name compares as itself and reports unaccounted, which
    // is fail-closed rather than a lost run.
    expect(decodeSegment('100%')).toBe('100%');
    expect(decodeSegment('invoices')).toBe('invoices');
  });

  it('keeps the default-database pin working through decoding', () => {
    const live = parseLiveIndexes([asLiveRow('invoices', [{ fieldPath: 'tenantId', order: A }])]);
    expect(live[0].database).toBe('(default)');
    expect(() => assertDefaultDatabase(live)).not.toThrow();
  });
});

/**
 * Entries rejected by the pre-deploy evidence audit of 2026-09-10.
 *
 * Inventory run 34447576469 produced a 35-entry create plan (digest f7be5e55…). Every
 * entry was traced to the query that needs it before deployment was considered, and
 * eleven had no current query at all: they were manifest history, not requirements.
 * Firestore charges storage and write amplification for every composite index, so an
 * index nothing queries is a permanent cost with no reader.
 *
 * They are listed here with the evidence that rejected each, because the failure mode is
 * silent — a shape reintroduced by a future edit would simply be created on the next
 * deploy, and nothing else in this suite would object.
 *
 * Two of them name collections that DO NOT EXIST in this codebase at all:
 *   - `audit_logs` — the real collection is `auditLogs` (lib/tenant/audit.ts:25)
 *   - `hr_employees` — HR employees live in `users`
 *     (app/api/admin/hr/employees/list/route.ts:18)
 * Live indexes on those collection groups are still preserved in the manifest, because
 * production has them and this repository cannot prove they hold no data. Preserving an
 * index that exists and creating a new one are different acts, and only the second is
 * refused here.
 */
describe('indexes the pre-deploy evidence audit rejected', () => {
  const REJECTED: Array<[string, string[], string]> = [
    [
      'invoices',
      ['tenantId:ASCENDING', 'status:ASCENDING', 'dueDate:DESCENDING'],
      'no query orders invoices by dueDate DESC; both dueDate reads are ASC with tenantId+isPaid (app/api/ai/tools/read/route.ts:121)',
    ],
    [
      'users',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      'app/api/admin/users/list/route.ts:20 sorts in JS and says so; super_admin/users/route.ts:22 has no where clause',
    ],
    [
      'deals',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      'the deals list filters isDeleted and gets tenantId appended by queryWithTenant, so it needs isDeleted+tenantId+createdAt',
    ],
    [
      'invoices',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      'app/api/finance/invoices/list/route.ts:47 applies tenantId AND isDeleted unconditionally',
    ],
    [
      'documents',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      'the documents collection has no list query at all; storage-service.ts:171 is a doc().update()',
    ],
    [
      'notifications',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      'every notifications list query also filters a recipient field or isArchived',
    ],
    [
      'hr_employees',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      "no collection('hr_employees') exists; HR employees are rows in users",
    ],
    [
      'audit_logs',
      ['tenantId:ASCENDING', 'createdAt:DESCENDING'],
      "no collection('audit_logs') exists; the real collection is auditLogs",
    ],
    [
      'platform_tickets',
      ['priority:ASCENDING', 'createdAt:DESCENDING'],
      "where('priority') appears nowhere in the codebase",
    ],
    [
      'platform_tickets',
      ['triageStatus:ASCENDING', 'createdAt:DESCENDING'],
      "where('triageStatus') appears nowhere in the codebase",
    ],
    [
      'platform_tickets',
      ['status:ASCENDING', 'priority:ASCENDING', 'createdAt:DESCENDING'],
      'no query combines status and priority',
    ],
  ];

  const declared = new Set(
    (JSON.parse(read('firestore.indexes.json')).indexes as RawIndex[]).map(
      (index) =>
        index.collectionGroup +
        '|' +
        (index.fields || [])
          .filter((f) => f.fieldPath !== '__name__')
          .map((f) => f.fieldPath + ':' + (f.order || f.arrayConfig))
          .join(','),
    ),
  );

  it.each(REJECTED)('does not declare %s (%s)', (collectionGroup, fields, _why) => {
    expect(declared.has(collectionGroup + '|' + (fields as string[]).join(','))).toBe(false);
  });

  it('adds no NEW index to the two collection groups that do not exist in code', () => {
    // Production carries eight `audit_logs` and three `documents` composite indexes even
    // though the code writes `auditLogs` and only ever reached `documents` by doc id.
    // Those are live, so they stay: this repository cannot prove they hold no data, and
    // preserving an index that exists is not the same act as creating a new one.
    //
    // What must not happen is the manifest growing an UNJUSTIFIED index on either.
    // Pinning the exact set means any addition fails here and has to be justified
    // against a live query first — which is the whole point of the no-deletion gate in
    // reverse.
    //
    // PR4 adds exactly one, and retires the premise behind the original `documents`
    // entry: `documents` is no longer reached by doc id alone. getTenantStorageUsage()
    // now sums the tenant's live document bytes, so
    // `where(tenantId ==) + where(deletedAt == null)` is a real, hot, per-upload query
    // and needs its composite index. `audit_logs` is untouched.
    const shapes = (JSON.parse(read('firestore.indexes.json')).indexes as RawIndex[])
      .filter(
        (index) => index.collectionGroup === 'audit_logs' || index.collectionGroup === 'documents',
      )
      .map(
        (index) =>
          index.collectionGroup +
          ': ' +
          (index.fields || [])
            .filter((f) => f.fieldPath !== '__name__')
            .map((f) => f.fieldPath + ' ' + (f.order || f.arrayConfig))
            .join(', '),
      )
      .sort();

    expect(shapes).toEqual(
      [
        'audit_logs: tenantId ASCENDING, action ASCENDING, createdAt DESCENDING',
        'audit_logs: tenantId ASCENDING, action ASCENDING, timestamp DESCENDING',
        'audit_logs: tenantId ASCENDING, resource ASCENDING, timestamp DESCENDING',
        'audit_logs: tenantId ASCENDING, resourceType ASCENDING, createdAt DESCENDING',
        'audit_logs: tenantId ASCENDING, status ASCENDING, timestamp DESCENDING',
        'audit_logs: tenantId ASCENDING, timestamp DESCENDING',
        'audit_logs: tenantId ASCENDING, userId ASCENDING, createdAt DESCENDING',
        'audit_logs: tenantId ASCENDING, userId ASCENDING, timestamp DESCENDING',
        'documents: tenantId ASCENDING, deletedAt ASCENDING',
        'documents: tenantId ASCENDING, fileType ASCENDING, createdAt DESCENDING',
        'documents: tenantId ASCENDING, folderId ASCENDING, createdAt DESCENDING',
        'documents: tenantId ASCENDING, uploadedBy ASCENDING, createdAt DESCENDING',
      ].sort(),
    );
  });
});
