/**
 * PR5 — the Super Admin restore endpoint, exercised rather than described.
 *
 * __tests__/api/restore-route.test.ts reads the route's source and checks that the words
 * "sha256", "restore_${runDate}__" and "requireSuperAdmin(" appear in it. That cannot tell a
 * checksum that is computed from one that is compared, and it cannot observe where the
 * writes actually land. Restoring a backup is the most destructive operation the platform
 * has, so the guards are run here against a real (in-memory) Firestore and a fake bucket.
 *
 * The invariant that matters most and is checked several ways below: NOTHING outside a
 * `restore_<runDate>__<collection>` collection is ever written.
 */

import { createHash } from 'crypto';
import { createInMemoryFirestore } from './test-utils/in-memory-firestore';

const firestore = createInMemoryFirestore();

/** path -> file contents. A missing path throws, as Cloud Storage does. */
const objects = new Map<string, string>();

const requireSuperAdmin = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return firestore.adminDb;
  },
  adminStorage: {
    bucket: () => ({
      file: (objectPath: string) => ({
        download: async () => {
          const body = objects.get(objectPath);
          if (body === undefined) throw new Error(`No such object: ${objectPath}`);
          return [Buffer.from(body, 'utf8')];
        },
      }),
    }),
  },
}));
jest.mock('@/lib/backup/backup-bucket', () => ({
  getBackupBucketName: () => 'bizosto-backups-test',
}));
jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdmin(...args),
}));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__server_timestamp__' } },
}));

import { GET, POST } from '@/app/api/super_admin/restore/route';

const RUN_DATE = '2026-06-01';
const MANIFEST_PATH = `backups/${RUN_DATE}/manifest.json`;

const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

type BackupDoc = Record<string, unknown>;

/** Writes a payload object plus the manifest entry that correctly describes it. */
function putBackupFile(tenantId: string, collection: string, docs: BackupDoc[]) {
  const path = `backups/${RUN_DATE}/${tenantId}/${collection}.json`;
  const body = JSON.stringify(docs);
  objects.set(path, body);
  return { path, tenantId, collection, records: docs.length, sha256: sha256(body) };
}

function putManifest(files: unknown[], over: Record<string, unknown> = {}, at = MANIFEST_PATH) {
  objects.set(at, JSON.stringify({ runDate: RUN_DATE, files, ...over }));
}

const getRequest = (params: Record<string, string>) =>
  ({
    nextUrl: { searchParams: new URLSearchParams(params) },
  }) as never;

const postRequest = (body: unknown) =>
  ({
    json: async () => body,
  }) as never;

/** Every collection that currently holds at least one document. */
const writtenCollections = () =>
  [
    'invoices',
    'payments',
    'users',
    'tenants',
    'clients',
    'projects',
    `restore_${RUN_DATE}__invoices`,
    `restore_${RUN_DATE}__payments`,
  ].filter((name) => firestore.all(name).length > 0);

beforeEach(() => {
  firestore.reset();
  objects.clear();
  requireSuperAdmin.mockReset().mockResolvedValue({ uid: 'super-admin-1' });
});

describe('PR5 restore: authorization', () => {
  it('refuses both verbs when the caller is not a Super Admin', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    const dryRun = await GET(getRequest({ manifestPath: MANIFEST_PATH }));
    const apply = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(dryRun.status).toBe(403);
    expect(apply.status).toBe(403);
    expect(firestore.all('restore_audit')).toHaveLength(0);
  });
});

describe('PR5 restore: only a canonical manifest object is readable', () => {
  const rejected = [
    'backups/../../../etc/passwd',
    'backups/2026-06-01/../../secrets/manifest.json',
    'backups/2026-06-01/manifest.json/../../../x',
    'backups%2F2026-06-01%2Fmanifest.json',
    'backups/2026-6-1/manifest.json',
    'backups/2026-06-01/tenant-a/invoices.json',
    'manifest.json',
    'gs://another-bucket/backups/2026-06-01/manifest.json',
    '',
  ];

  it.each(rejected)('refuses %p as a manifest path', async (manifestPath) => {
    const response = await POST(postRequest({ manifestPath }));
    expect(response.status).toBe(400);
    // Nothing was even fetched, let alone applied.
    expect(writtenCollections()).toEqual([]);
  });

  it('refuses a manifest whose runDate disagrees with the path it was read from', async () => {
    // Otherwise a manifest uploaded under one date could restore another date's file set.
    putManifest([putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }])], {
      runDate: '2026-05-01',
    });

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid manifest' });
  });
});

describe('PR5 restore: manifest entries must describe files we actually wrote', () => {
  it('refuses an entry whose path is not derived from runDate + tenant + collection', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    putManifest([{ ...file, path: `backups/${RUN_DATE}/tenant-b/invoices.json` }]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(400);
    expect(writtenCollections()).toEqual([]);
  });

  it('refuses tenant and collection names that are not plain segments', async () => {
    for (const [tenantId, collection] of [
      ['../tenant-a', 'invoices'],
      ['tenant-a', '../../users'],
      ['tenant-a', 'invoices/../users'],
      ['tenant a', 'invoices'],
      ['tenant-a', ''],
    ]) {
      objects.clear();
      const path = `backups/${RUN_DATE}/${tenantId}/${collection}.json`;
      const body = JSON.stringify([{ id: 'i1', tenantId }]);
      objects.set(path, body);
      putManifest([{ path, tenantId, collection, records: 1, sha256: sha256(body) }]);

      const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));
      expect(response.status).toBe(400);
    }
    expect(writtenCollections()).toEqual([]);
  });

  it('refuses a manifest that names the same object twice', async () => {
    // Two entries for one path can disagree on sha256 or records, so whichever validated
    // last would decide what "verified" means, and the file would be applied twice.
    const file = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    putManifest([file, file]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('duplicate'),
    });
    expect(writtenCollections()).toEqual([]);
  });

  it('refuses a malformed sha256 or a negative record count', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);

    putManifest([{ ...file, sha256: 'not-a-digest' }]);
    expect((await POST(postRequest({ manifestPath: MANIFEST_PATH }))).status).toBe(400);

    putManifest([{ ...file, records: -1 }]);
    expect((await POST(postRequest({ manifestPath: MANIFEST_PATH }))).status).toBe(400);

    putManifest([{ ...file, records: 1.5 }]);
    expect((await POST(postRequest({ manifestPath: MANIFEST_PATH }))).status).toBe(400);
  });
});

describe('PR5 restore: payload integrity is proved before anything is applied', () => {
  it('aborts and audits when a downloaded file does not match its checksum', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    // The bytes changed after the manifest was written.
    objects.set(file.path, JSON.stringify([{ id: 'i1', tenantId: 'tenant-a', total: 999 }]));
    putManifest([file]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(422);
    expect(writtenCollections()).toEqual([]);
    expect(firestore.all('restore_audit')[0][1]).toMatchObject({
      status: 'aborted',
      reason: 'checksum_mismatch',
      actorUserId: 'super-admin-1',
    });
  });

  it('aborts when the payload holds a different number of records than declared', async () => {
    const path = `backups/${RUN_DATE}/tenant-a/invoices.json`;
    const body = JSON.stringify([
      { id: 'i1', tenantId: 'tenant-a' },
      { id: 'i2', tenantId: 'tenant-a' },
    ]);
    objects.set(path, body);
    putManifest([
      { path, tenantId: 'tenant-a', collection: 'invoices', records: 1, sha256: sha256(body) },
    ]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(400);
    expect(writtenCollections()).toEqual([]);
  });

  it('aborts on a document whose id could address something else', async () => {
    for (const id of ['tenant-a/invoices/i1', '..', '.', '__name__', '']) {
      objects.clear();
      firestore.reset();
      const file = putBackupFile('tenant-a', 'invoices', [{ id, tenantId: 'tenant-a' }]);
      putManifest([file]);

      const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

      expect(response.status).toBe(400);
      expect(writtenCollections()).toEqual([]);
    }
  });

  it('aborts on a duplicate document id inside one payload', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [
      { id: 'i1', tenantId: 'tenant-a' },
      { id: 'i1', tenantId: 'tenant-a' },
    ]);
    putManifest([file]);

    expect((await POST(postRequest({ manifestPath: MANIFEST_PATH }))).status).toBe(400);
    expect(writtenCollections()).toEqual([]);
  });

  it('aborts when a tenant-scoped file carries another tenant’s document', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [
      { id: 'i1', tenantId: 'tenant-a' },
      { id: 'i2', tenantId: 'tenant-b' },
    ]);
    putManifest([file]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(400);
    expect(writtenCollections()).toEqual([]);
    expect(firestore.all('restore_audit')[0][1]).toMatchObject({
      status: 'aborted',
      reason: 'invalid_backup_payload',
    });
  });

  it('validates every selected file before applying any of them', async () => {
    // The first file is perfectly good; the second is corrupt. Nothing may be written,
    // because a half-applied restore is worse than a refused one.
    const good = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    const bad = putBackupFile('tenant-a', 'payments', [{ id: 'p1', tenantId: 'tenant-a' }]);
    objects.set(bad.path, JSON.stringify([{ id: 'p1', tenantId: 'tenant-a', amount: 1 }]));
    putManifest([good, bad]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(response.status).toBe(422);
    expect(firestore.all(`restore_${RUN_DATE}__invoices`)).toHaveLength(0);
    expect(writtenCollections()).toEqual([]);
  });
});

describe('PR5 restore: a valid apply lands only in the isolated restore namespace', () => {
  it('writes the restore collection and never the live one', async () => {
    firestore.seed('invoices', 'i1', { tenantId: 'tenant-a', amountTotal: 500, live: true });
    const file = putBackupFile('tenant-a', 'invoices', [
      { id: 'i1', tenantId: 'tenant-a', amountTotal: 100 },
      { id: 'i2', tenantId: 'tenant-a', amountTotal: 200 },
    ]);
    putManifest([file]);

    const response = await POST(postRequest({ manifestPath: MANIFEST_PATH }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      runDate: RUN_DATE,
      filesApplied: 1,
      restoredRecords: 2,
    });

    // The live document is untouched: same amount, still flagged live.
    expect(firestore.read('invoices', 'i1')).toEqual({
      tenantId: 'tenant-a',
      amountTotal: 500,
      live: true,
    });

    const restored = firestore.all(`restore_${RUN_DATE}__invoices`);
    expect(restored.map(([id]) => id).sort()).toEqual(['i1', 'i2']);
    expect(restored[0][1]).toMatchObject({
      tenantId: 'tenant-a',
      __restoredFrom: file.path,
    });
    // `id` is consumed as the document id rather than stored back as a field.
    expect(restored[0][1]).not.toHaveProperty('id');
  });

  it('audits each applied file with the actor who ran it', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    putManifest([file]);

    await POST(postRequest({ manifestPath: MANIFEST_PATH }));

    expect(firestore.all('restore_audit')[0][1]).toMatchObject({
      status: 'applied',
      runDate: RUN_DATE,
      restoreCollection: `restore_${RUN_DATE}__invoices`,
      tenantId: 'tenant-a',
      records: 1,
      actorUserId: 'super-admin-1',
    });
  });

  it('scopes an apply to the requested tenant and refuses an empty selection', async () => {
    const a = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    const b = putBackupFile('tenant-b', 'invoices', [{ id: 'i2', tenantId: 'tenant-b' }]);
    putManifest([a, b]);

    await POST(postRequest({ manifestPath: MANIFEST_PATH, tenantId: 'tenant-a' }));
    expect(firestore.all(`restore_${RUN_DATE}__invoices`).map(([id]) => id)).toEqual(['i1']);

    const empty = await POST(postRequest({ manifestPath: MANIFEST_PATH, tenantId: 'tenant-z' }));
    expect(empty.status).toBe(404);
  });

  it('refuses a filter that is not a plain segment', async () => {
    const file = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    putManifest([file]);

    const response = await POST(
      postRequest({ manifestPath: MANIFEST_PATH, collection: '../../users' }),
    );

    expect(response.status).toBe(400);
    expect(writtenCollections()).toEqual([]);
  });
});

describe('PR5 restore: the dry run really is dry', () => {
  it('verifies checksums and writes nothing at all', async () => {
    const good = putBackupFile('tenant-a', 'invoices', [{ id: 'i1', tenantId: 'tenant-a' }]);
    const bad = putBackupFile('tenant-a', 'payments', [{ id: 'p1', tenantId: 'tenant-a' }]);
    objects.set(bad.path, JSON.stringify([{ id: 'p1', tenantId: 'tenant-a', amount: 7 }]));
    putManifest([good, bad]);

    const response = await GET(getRequest({ manifestPath: MANIFEST_PATH }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ dryRun: true, files: 2, verified: 1, mismatched: 1 });
    expect(payload.results[0].restoreCollection).toBe(`restore_${RUN_DATE}__invoices`);

    // No restore collection, no audit record, no live write.
    expect(writtenCollections()).toEqual([]);
    expect(firestore.all('restore_audit')).toHaveLength(0);
  });
});
