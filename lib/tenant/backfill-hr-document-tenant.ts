import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * S12 backfill: employeeDocuments written by the admin HR upload route carried no
 * `tenantId`.
 *
 * Every read path for HR documents filters `where('tenantId', '==', ...)`, so those
 * records are invisible to the very tenant that owns them — the document uploaded through
 * the admin HR screen simply never appears in the list — and (since S11) they are also
 * invisible to storage accounting.
 *
 * The tenant is derived from the document's employee (`userId` -> users/{uid}.tenantId),
 * which is the authoritative relationship. A document whose employee cannot be resolved is
 * left untouched and reported, never assigned to an arbitrary tenant.
 *
 * NOTE: `size` cannot be backfilled. It was never persisted and is not recoverable from
 * Firestore, so pre-existing HR documents will not count toward the plan storage limit.
 * Only newly uploaded documents are metered.
 */
export async function backfillHrDocumentTenantIds(): Promise<{
  scanned: number;
  updated: number;
  skippedNoEmployee: number;
}> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const userTenantCache = new Map<string, string | null>();

  let scanned = 0;
  let updated = 0;
  let skippedNoEmployee = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  async function resolveUserTenant(userId: string): Promise<string | null> {
    if (userTenantCache.has(userId)) {
      return userTenantCache.get(userId) ?? null;
    }
    const snap = await adminDb.collection('users').doc(userId).get();
    const tenantId = snap.exists ? String(snap.data()?.tenantId || '') || null : null;
    userTenantCache.set(userId, tenantId);
    return tenantId;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = adminDb
      .collection('employeeDocuments')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(300);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    const batch = adminDb.batch();
    let hasUpdates = false;

    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data() || {};
      const existing = data.tenantId;
      if (existing !== undefined && existing !== null && existing !== '') {
        continue;
      }

      const userId = String(data.userId || '');
      if (!userId) {
        skippedNoEmployee += 1;
        continue;
      }

      const tenantId = await resolveUserTenant(userId);
      if (!tenantId) {
        skippedNoEmployee += 1;
        continue;
      }

      batch.set(doc.ref, { tenantId, updatedAt: now }, { merge: true });
      hasUpdates = true;
      updated += 1;
    }

    if (hasUpdates) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 300) break;
  }

  return { scanned, updated, skippedNoEmployee };
}
