import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * S2 backfill: file records historically written by the production, AM and client
 * upload routes omitted `tenantId`. Those records are invisible to every
 * tenant-scoped `files` list/versioning query. This backfill derives the correct
 * tenantId from each file's parent project (the authoritative relationship) rather
 * than assuming a single default tenant, so it is safe in a multi-tenant world.
 *
 * A file whose project cannot be resolved is left untouched and reported, never
 * assigned to an arbitrary tenant.
 */
export async function backfillFileTenantIds(): Promise<{
  scanned: number;
  updated: number;
  skippedNoProject: number;
}> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const projectTenantCache = new Map<string, string | null>();

  let scanned = 0;
  let updated = 0;
  let skippedNoProject = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  async function resolveProjectTenant(projectId: string): Promise<string | null> {
    if (projectTenantCache.has(projectId)) {
      return projectTenantCache.get(projectId) ?? null;
    }
    const snap = await adminDb.collection('projects').doc(projectId).get();
    const tenantId = snap.exists ? String(snap.data()?.tenantId || '') || null : null;
    projectTenantCache.set(projectId, tenantId);
    return tenantId;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = adminDb
      .collection('files')
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
      const projectId = String(data.projectId || '');
      if (!projectId) {
        skippedNoProject += 1;
        continue;
      }
      const tenantId = await resolveProjectTenant(projectId);
      if (!tenantId) {
        skippedNoProject += 1;
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

  return { scanned, updated, skippedNoProject };
}
