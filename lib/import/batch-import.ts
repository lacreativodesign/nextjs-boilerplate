import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';

type BatchImportParams = {
  tenantId: string;
  collection: string;
  rows: Record<string, unknown>[];
  importJobId?: string;
};

async function updateImportProgress(
  tenantId: string,
  importJobId: string,
  imported: number,
  total: number,
) {
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('importJobs')
    .doc(importJobId)
    .set(
      {
        tenantId,
        status: imported >= total ? 'completed' : 'processing',
        processedRows: imported,
        totalRows: total,
        progress: total > 0 ? Math.round((imported / total) * 100) : 100,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function batchImport({ tenantId, collection, rows, importJobId }: BatchImportParams) {
  const BATCH_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    const chunk = rows.slice(i, i + BATCH_SIZE);

    chunk.forEach((row) => {
      const docRef = adminDb.collection('tenants').doc(tenantId).collection(collection).doc();

      batch.set(docRef, {
        ...row,
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    imported += chunk.length;

    if (importJobId) {
      await updateImportProgress(tenantId, importJobId, imported, rows.length);
    }
  }

  return { imported, total: rows.length };
}
