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
import * as path from 'path';

import {
  DEFAULT_DATABASE,
  assertDefaultDatabase,
  assertNoDeletions,
  createCommandArgs,
  findKeyCollisions,
  indexKey,
  notReady,
  parseLiveIndexes,
  parseManifest,
  reconcile,
} from '@/scripts/firestore-index-reconcile.mjs';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const A = 'ASCENDING';
const D = 'DESCENDING';

type Field = { fieldPath: string; order?: string; arrayConfig?: string };
/** Shape the .mjs module returns; TypeScript infers it too loosely across the JS boundary. */
type Indexish = { collectionGroup: string };
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

describe('the create plan can only create', () => {
  it('emits gcloud composite-create arguments and no destructive verb', () => {
    const args = createCommandArgs(
      idx('projects', [
        { fieldPath: 'clientId', order: A },
        { fieldPath: 'updatedAt', order: D },
      ]),
      { project: 'la-creativo-erp' },
    );
    expect(args.slice(0, 4)).toEqual(['firestore', 'indexes', 'composite', 'create']);
    expect(args).toContain('--project=la-creativo-erp');
    expect(args).toContain(`--database=${DEFAULT_DATABASE}`);
    expect(args).toContain('--collection-group=projects');
    expect(args).toContain('--field-config=field-path=clientId,order=ascending');
    expect(args).toContain('--field-config=field-path=updatedAt,order=descending');
    expect(args.join(' ')).not.toMatch(/\b(delete|remove|destroy|--force)\b/);
  });

  it('carries array-contains fields through correctly', () => {
    const args = createCommandArgs(
      idx('projects', [{ fieldPath: 'teamMemberIds', arrayConfig: 'CONTAINS' }]),
      {
        project: 'p',
      },
    );
    expect(args).toContain('--field-config=field-path=teamMemberIds,array-config=contains');
  });

  it('omits a redundant __name__, which Firestore appends itself', () => {
    const args = createCommandArgs(
      idx('leads', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'createdAt', order: D },
        { fieldPath: '__name__', order: D },
      ]),
      { project: 'p' },
    );
    expect(args.join(' ')).not.toContain('__name__');
  });

  it('states a contradictory __name__, because Firestore will not infer it', () => {
    const args = createCommandArgs(
      idx('projects', [
        { fieldPath: 'status', order: A },
        { fieldPath: '__name__', order: D },
      ]),
      { project: 'p' },
    );
    expect(args).toContain('--field-config=field-path=__name__,order=descending');
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

  it('keeps the two indexes whose __name__ direction is deliberate', () => {
    // projects(managerId, status) and milestones(projectId, dueDate) both end on an
    // ASCENDING field but declare __name__ DESCENDING. Those are distinct indexes and
    // must survive de-duplication rather than being folded into their neighbours.
    const keys = new Set(manifest.map(indexKey));
    for (const index of [
      idx('projects', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'managerId', order: A },
        { fieldPath: 'status', order: A },
        { fieldPath: '__name__', order: D },
      ]),
      idx('milestones', [
        { fieldPath: 'tenantId', order: A },
        { fieldPath: 'projectId', order: A },
        { fieldPath: 'dueDate', order: A },
        { fieldPath: '__name__', order: D },
      ]),
    ]) {
      expect(keys.has(indexKey(index))).toBe(true);
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
