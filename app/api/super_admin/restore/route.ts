import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * super_admin restore with dry-run + isolated apply (DR-03).
 *
 * The D1 nightly cron writes per-tenant, per-collection JSON files plus a
 * checksummed manifest.json under backups/<runDate>/. There was no way to
 * restore them, and restoring straight over live collections is dangerous:
 * a corrupt or truncated backup would silently overwrite good data.
 *
 * This route never does that. It exposes two super_admin-only handlers:
 *
 *   GET  ?manifestPath=backups/<runDate>/manifest.json
 *     DRY-RUN. Re-downloads every file the manifest lists, recomputes its
 *     sha256, and reports which files WOULD restore cleanly vs. which are
 *     corrupt. It writes nothing — no Firestore, no Storage.
 *
 *   POST { manifestPath, collection?, tenantId? }
 *     ISOLATED APPLY. Verifies every selected file's checksum first and
 *     aborts the whole run on ANY mismatch, then writes the documents into
 *     restore_<runDate>__<collection> collections — never the live ones —
 *     so an operator can inspect the restored copy before promoting it.
 *     Every apply (and every abort) is recorded to restore_audit.
 *
 * Only manifest paths under backups/ are accepted, so this route can never be
 * pointed at an arbitrary Storage object.
 */

const BACKUP_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'bizosto-backups';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

type ManifestFile = {
  path: string;
  tenantId: string;
  collection: string;
  records: number;
  sha256: string;
};

type Manifest = {
  runDate: string;
  files: ManifestFile[];
};

/**
 * Only ever accept a manifest.json living under backups/. This is the guard
 * that stops the route being pointed at any other Storage object.
 */
function isBackupManifestPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('backups/') &&
    value.endsWith('manifest.json') &&
    !value.includes('..')
  );
}

async function loadManifest(
  bucket: ReturnType<typeof adminStorage.bucket>,
  manifestPath: string,
): Promise<Manifest> {
  const [raw] = await bucket.file(manifestPath).download();
  const manifest = JSON.parse(raw.toString('utf8')) as Manifest;
  if (!manifest || typeof manifest.runDate !== 'string' || !Array.isArray(manifest.files)) {
    throw new Error('Invalid manifest');
  }
  return manifest;
}

function selectFiles(
  files: ManifestFile[],
  collection?: string | null,
  tenantId?: string | null,
): ManifestFile[] {
  let selected = files;
  if (collection) selected = selected.filter((file) => file.collection === collection);
  if (tenantId) selected = selected.filter((file) => file.tenantId === tenantId);
  return selected;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * GET — DRY-RUN. Verifies every backed-up file against the manifest and
 * reports what would be restored. Writes nothing.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const manifestPath = req.nextUrl.searchParams.get('manifestPath');
    if (!isBackupManifestPath(manifestPath)) {
      return NextResponse.json(
        { ok: false, error: 'manifestPath must be a backups/<runDate>/manifest.json path' },
        { status: 400 },
      );
    }

    const bucket = adminStorage.bucket(BACKUP_BUCKET);
    const manifest = await loadManifest(bucket, manifestPath);
    const files = selectFiles(
      manifest.files,
      req.nextUrl.searchParams.get('collection'),
      req.nextUrl.searchParams.get('tenantId'),
    );

    const results = [];
    let verified = 0;
    let mismatched = 0;
    let totalRecords = 0;

    for (const file of files) {
      const [raw] = await bucket.file(file.path).download();
      const actualSha256 = sha256(raw.toString('utf8'));
      const ok = actualSha256 === file.sha256;
      if (ok) verified += 1;
      else mismatched += 1;
      totalRecords += file.records;

      results.push({
        path: file.path,
        collection: file.collection,
        tenantId: file.tenantId,
        records: file.records,
        restoreCollection: `restore_${manifest.runDate}__${file.collection}`,
        expectedSha256: file.sha256,
        actualSha256,
        ok,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun: true,
      runDate: manifest.runDate,
      manifestPath,
      files: files.length,
      verified,
      mismatched,
      totalRecords,
      results,
    });
  } catch (error: any) {
    const message = error?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/**
 * POST — ISOLATED APPLY. Restores into restore_<runDate>__<collection>
 * collections only; live data is never touched. Aborts on any checksum
 * mismatch and audits every apply to restore_audit.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);

    const body = (await req.json()) as {
      manifestPath?: string;
      collection?: string;
      tenantId?: string;
    };
    const manifestPath = body?.manifestPath;
    if (!isBackupManifestPath(manifestPath)) {
      return NextResponse.json(
        { ok: false, error: 'manifestPath must be a backups/<runDate>/manifest.json path' },
        { status: 400 },
      );
    }

    const bucket = adminStorage.bucket(BACKUP_BUCKET);
    const manifest = await loadManifest(bucket, manifestPath);
    const runDate = manifest.runDate;
    const files = selectFiles(manifest.files, body.collection, body.tenantId);

    // Pass 1 — download and verify EVERY selected file before writing anything.
    // Any checksum mismatch aborts the whole run so we can never leave a
    // half-applied restore behind. The abort is audited too.
    const verified: Array<{ file: ManifestFile; docs: Array<Record<string, unknown>> }> = [];
    for (const file of files) {
      const [raw] = await bucket.file(file.path).download();
      const text = raw.toString('utf8');
      const actualSha256 = sha256(text);
      if (actualSha256 !== file.sha256) {
        await adminDb.collection('restore_audit').add({
          manifestPath,
          runDate,
          status: 'aborted',
          reason: 'checksum_mismatch',
          path: file.path,
          collection: file.collection,
          tenantId: file.tenantId,
          expectedSha256: file.sha256,
          actualSha256,
          actorUserId: user.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new Error(`Checksum mismatch for ${file.path}`);
      }
      const docs = JSON.parse(text) as Array<Record<string, unknown> & { id?: unknown }>;
      if (!Array.isArray(docs)) {
        throw new Error(`Invalid backup payload for ${file.path}`);
      }
      verified.push({ file, docs });
    }

    // Pass 2 — write each verified file into its ISOLATED restore_ collection.
    // Live collections are never referenced here.
    const applied = [];
    let restoredRecords = 0;
    for (const { file, docs } of verified) {
      const restoreCollection = `restore_${runDate}__${file.collection}`;

      for (const batchDocs of chunk(docs, 400)) {
        const batch = adminDb.batch();
        for (const docPayload of batchDocs) {
          const { id, ...docData } = docPayload as Record<string, unknown> & { id?: unknown };
          if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`Invalid document id in ${file.path}`);
          }
          const ref = adminDb.collection(restoreCollection).doc(id);
          batch.set(ref, {
            ...docData,
            __restoredFrom: file.path,
            __restoredAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }

      restoredRecords += docs.length;
      applied.push({
        path: file.path,
        restoreCollection,
        collection: file.collection,
        tenantId: file.tenantId,
        records: docs.length,
      });

      await adminDb.collection('restore_audit').add({
        manifestPath,
        runDate,
        status: 'applied',
        path: file.path,
        restoreCollection,
        collection: file.collection,
        tenantId: file.tenantId,
        records: docs.length,
        sha256: file.sha256,
        actorUserId: user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({
      ok: true,
      runDate,
      manifestPath,
      filesApplied: applied.length,
      restoredRecords,
      applied,
    });
  } catch (error: any) {
    const message = error?.message || 'Server error';
    const status =
      message === 'Forbidden' ? 403 : message.startsWith('Checksum mismatch') ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
