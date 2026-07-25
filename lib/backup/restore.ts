import { createHash } from 'crypto';
import admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { getBackupBucketName } from '@/lib/backup/backup-bucket';

/**
 * Backup restore (P1-6b).
 *
 * The previous implementation could never run, and would have corrupted data if it had. It was
 * written against a backup format that does not exist:
 *
 *   1. Wrong record shape. It required a single-tenant `backups` record with a `tenantId`
 *      field. The cron writes a MULTI-tenant record (`tenants: <count>`, no `tenantId`), so
 *      `assertBackupRecord` threw immediately on every real backup — restore had never once
 *      completed.
 *   2. Wrong read path. It read `${storagePath}/${collection}.json`, but the cron writes
 *      `backups/{runDate}/{tenantId}/{collection}.json`. The tenant segment was missing, so
 *      every download would 404.
 *   3. Wrong write location. It wrote to `tenants/{tenantId}/{collection}/{id}` subcollections,
 *      but the application (and the backup) use TOP-LEVEL collections keyed by a tenantId
 *      field. A restore would have written every document to a location nothing reads — the
 *      exact DR-01 defect the backup path fixed and the restore path never did.
 *   4. No integrity check. The cron writes a per-file sha256 into the manifest; restore ignored
 *      it and would happily import a truncated or corrupted file.
 *   5. No dry run. A restore overwrites live data with no way to preview what it would touch.
 *
 * This rewrite drives everything off the manifest the backup actually writes. The manifest
 * lists every file with its tenantId, collection, record count and sha256. Restore downloads
 * each listed file, verifies its checksum, and writes documents back to the TOP-LEVEL
 * collection under their original id. `dryRun` reports exactly what would be written, verifying
 * integrity, without touching Firestore.
 */

type ManifestFile = {
  path: string;
  tenantId: string;
  collection: string;
  records: number;
  sha256: string;
};

type BackupManifest = {
  runDate: string;
  files: ManifestFile[];
};

export type RestoreOptions = {
  dryRun?: boolean;
  /** When set, only these tenants are restored. Empty/undefined restores every tenant. */
  tenantIds?: string[];
};

export type RestoreResult = {
  dryRun: boolean;
  runDate: string;
  filesProcessed: number;
  documentsRestored: number;
  tenants: string[];
  files: Array<{ path: string; tenantId: string; collection: string; records: number }>;
};

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function assertManifest(value: unknown): asserts value is BackupManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid backup manifest');
  }
  const candidate = value as Partial<BackupManifest>;
  if (!Array.isArray(candidate.files)) {
    throw new Error('Backup manifest is missing its files list');
  }
  for (const file of candidate.files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      typeof file.tenantId !== 'string' ||
      typeof file.collection !== 'string' ||
      typeof file.sha256 !== 'string'
    ) {
      throw new Error('Backup manifest contains a malformed file entry');
    }
  }
}

export async function restoreBackup(
  backupId: string,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  if (!backupId || typeof backupId !== 'string') {
    throw new Error('backupId is required');
  }

  const dryRun = options.dryRun === true;
  const tenantFilter =
    Array.isArray(options.tenantIds) && options.tenantIds.length > 0
      ? new Set(options.tenantIds)
      : null;

  const backupRef = adminDb.collection('backups').doc(backupId);
  const backupSnap = await backupRef.get();
  if (!backupSnap.exists) {
    throw new Error('Backup not found');
  }

  const backupData = backupSnap.data() as Record<string, unknown>;
  const manifestPath = typeof backupData.manifestPath === 'string' ? backupData.manifestPath : '';
  if (!manifestPath) {
    throw new Error('Backup record is missing manifestPath');
  }

  const bucket = adminStorage.bucket(getBackupBucketName());

  // The manifest is the single source of truth for what to restore and where from.
  const [manifestRaw] = await bucket.file(manifestPath).download();
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as unknown;
  assertManifest(manifest);

  const targetFiles = manifest.files.filter(
    (file) => !tenantFilter || tenantFilter.has(file.tenantId),
  );

  if (!dryRun) {
    await backupRef.update({
      restoreStatus: 'in_progress',
      restoreStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  try {
    const tenants = new Set<string>();
    const summaries: RestoreResult['files'] = [];
    let documentsRestored = 0;

    for (const entry of targetFiles) {
      const [raw] = await bucket.file(entry.path).download();
      const text = raw.toString('utf8');

      // Integrity: the bytes must match the checksum the backup recorded.
      const actual = sha256(text);
      if (actual !== entry.sha256) {
        throw new Error(
          `Checksum mismatch for ${entry.path}: manifest ${entry.sha256}, downloaded ${actual}`,
        );
      }

      const docs = JSON.parse(text) as Array<Record<string, unknown> & { id?: string }>;
      if (!Array.isArray(docs)) {
        throw new Error(`Backup file ${entry.path} is not an array of documents`);
      }

      tenants.add(entry.tenantId);
      summaries.push({
        path: entry.path,
        tenantId: entry.tenantId,
        collection: entry.collection,
        records: docs.length,
      });

      if (dryRun) {
        documentsRestored += docs.length;
        continue;
      }

      // Write back to the TOP-LEVEL collection, keyed by the document's original id — the same
      // location the backup read from and the application uses.
      for (let i = 0; i < docs.length; i += 400) {
        const slice = docs.slice(i, i + 400);
        const batch = adminDb.batch();

        for (const docPayload of slice) {
          if (!docPayload?.id || typeof docPayload.id !== 'string') {
            throw new Error(`Document without an id in ${entry.path}`);
          }
          const { id, ...docData } = docPayload;
          const ref = adminDb.collection(entry.collection).doc(id);
          batch.set(
            ref,
            { ...docData, restoredAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
        }

        await batch.commit();
        documentsRestored += slice.length;
      }
    }

    const result: RestoreResult = {
      dryRun,
      runDate: manifest.runDate,
      filesProcessed: targetFiles.length,
      documentsRestored,
      tenants: [...tenants].sort(),
      files: summaries,
    };

    if (!dryRun) {
      await backupRef.update({
        restoreStatus: 'completed',
        restoredAt: admin.firestore.FieldValue.serverTimestamp(),
        restoreSummary: {
          filesProcessed: result.filesProcessed,
          documentsRestored: result.documentsRestored,
          tenants: result.tenants,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return result;
  } catch (error) {
    if (!dryRun) {
      await backupRef.update({
        restoreStatus: 'failed',
        restoreError: error instanceof Error ? error.message : 'Unknown restore error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    throw error;
  }
}
