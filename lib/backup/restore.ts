import admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { getBackupBucketName } from '@/lib/backup/backup-bucket';

type BackupRecord = {
  tenantId: string;
  storagePath: string;
  collections: string[];
};

function assertBackupRecord(value: unknown): asserts value is BackupRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid backup metadata');
  }

  const candidate = value as Partial<BackupRecord>;

  if (!candidate.tenantId || typeof candidate.tenantId !== 'string') {
    throw new Error('Backup metadata is missing tenantId');
  }

  if (!candidate.storagePath || typeof candidate.storagePath !== 'string') {
    throw new Error('Backup metadata is missing storagePath');
  }

  if (
    !Array.isArray(candidate.collections) ||
    candidate.collections.some((name) => typeof name !== 'string')
  ) {
    throw new Error('Backup metadata is missing collections');
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function restoreBackup(backupId: string) {
  if (!backupId || typeof backupId !== 'string') {
    throw new Error('backupId is required');
  }

  const backupRef = adminDb.collection('backups').doc(backupId);
  const backupSnap = await backupRef.get();

  if (!backupSnap.exists) {
    throw new Error('Backup not found');
  }

  const backupData = backupSnap.data();
  assertBackupRecord(backupData);

  const bucketName = getBackupBucketName();
  const bucket = adminStorage.bucket(bucketName);

  await backupRef.update({
    restoreStatus: 'in_progress',
    restoreStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    for (const collectionName of backupData.collections) {
      const file = bucket.file(`${backupData.storagePath}/${collectionName}.json`);
      const [raw] = await file.download();
      const docs = JSON.parse(raw.toString('utf8')) as Array<
        Record<string, unknown> & { id: string }
      >;

      if (!Array.isArray(docs)) {
        throw new Error(`Invalid backup payload for collection ${collectionName}`);
      }

      for (const docsBatch of chunk(docs, 400)) {
        const batch = adminDb.batch();

        for (const docPayload of docsBatch) {
          if (!docPayload?.id || typeof docPayload.id !== 'string') {
            throw new Error(`Invalid document id in collection ${collectionName}`);
          }

          const { id, ...docData } = docPayload;

          const ref = adminDb
            .collection('tenants')
            .doc(backupData.tenantId)
            .collection(collectionName)
            .doc(id);

          batch.set(ref, {
            ...docData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        await batch.commit();
      }
    }

    await backupRef.update({
      restoreStatus: 'completed',
      restoredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    await backupRef.update({
      restoreStatus: 'failed',
      restoreError: error instanceof Error ? error.message : 'Unknown restore error',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw error;
  }
}
