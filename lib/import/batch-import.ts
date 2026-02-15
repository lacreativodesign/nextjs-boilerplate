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

function normalizeArgs(
  tenantIdOrParams: string | BatchImportParams,
  collection?: string,
  rows?: Record<string, unknown>[],
): BatchImportParams {
  if (typeof tenantIdOrParams === 'string') {
    return {
      tenantId: tenantIdOrParams,
      collection: collection || '',
      rows: rows || [],
    };
  }

  return tenantIdOrParams;
}

export async function batchImport(
  tenantId: string,
  collection: string,
  rows: Record<string, unknown>[],
): Promise<{ imported: number; total: number }>;
export async function batchImport(
  params: BatchImportParams,
): Promise<{ imported: number; total: number }>;
export async function batchImport(
  tenantIdOrParams: string | BatchImportParams,
  collection?: string,
  rows?: Record<string, unknown>[],
) {
  const {
    tenantId,
    collection: targetCollection,
    rows: importRows,
    importJobId,
  } = normalizeArgs(tenantIdOrParams, collection, rows);

  const BATCH_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < importRows.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    const chunk = importRows.slice(i, i + BATCH_SIZE);

    chunk.forEach((row) => {
      const docRef = adminDb.collection('tenants').doc(tenantId).collection(targetCollection).doc();

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
      await updateImportProgress(tenantId, importJobId, imported, importRows.length);
    }
  }

  return { imported, total: importRows.length };
}
