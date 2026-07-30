import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import type {
  ComplianceReportType,
  DataRetentionPolicy,
  RetentionAction,
} from '@/types/compliance';

type ExportFormat = 'json' | 'csv';
type DeletionMode = 'anonymize' | 'delete';

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (value?.toDate) return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body = rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','));
  return [headers.join(','), ...body].join('\n');
}

export async function createRetentionPolicy(input: {
  tenantId: string;
  entityType: DataRetentionPolicy['entityType'];
  collectionPath: string;
  retentionDays: number;
  action: RetentionAction;
  enabled?: boolean;
  createdBy: string;
}) {
  const createdAt = nowIso();
  const ref = adminDb
    .collection('tenants')
    .doc(input.tenantId)
    .collection('complianceRetentionPolicies')
    .doc();
  const payload: Omit<DataRetentionPolicy, 'id'> = {
    tenantId: input.tenantId,
    entityType: input.entityType,
    collectionPath: input.collectionPath,
    retentionDays: input.retentionDays,
    action: input.action,
    enabled: input.enabled ?? true,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt,
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

export async function listRetentionPolicies(tenantId: string): Promise<DataRetentionPolicy[]> {
  const snapshot = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('complianceRetentionPolicies')
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<DataRetentionPolicy, 'id'>),
  }));
}

export async function runRetentionCleanup(tenantId: string) {
  const policies = await listRetentionPolicies(tenantId);
  const enabledPolicies = policies.filter((p) => p.enabled);

  const summary = {
    tenantId,
    policiesEvaluated: enabledPolicies.length,
    deleted: 0,
    archived: 0,
    scanned: 0,
  };

  for (const policy of enabledPolicies) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - policy.retentionDays);
    const cutoffTs = Timestamp.fromDate(cutoff);

    const q = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection(policy.collectionPath)
      .where('createdAt', '<=', cutoffTs)
      .limit(500);

    const snapshot = await q.get();
    summary.scanned += snapshot.size;

    if (snapshot.empty) continue;

    const batch = adminDb.batch();

    snapshot.docs.forEach((doc) => {
      if (policy.action === 'delete') {
        batch.delete(doc.ref);
        summary.deleted += 1;
      } else {
        batch.set(
          adminDb.collection('tenants').doc(tenantId).collection('complianceArchive').doc(),
          {
            sourceCollection: policy.collectionPath,
            sourceId: doc.id,
            tenantId,
            policyId: policy.id,
            archivedAt: FieldValue.serverTimestamp(),
            data: doc.data(),
          },
          { merge: false },
        );
        batch.delete(doc.ref);
        summary.archived += 1;
      }
    });

    await batch.commit();
  }

  return summary;
}

async function collectUserData(tenantId: string, userId: string) {
  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  const [userDoc, auditLogs] = await Promise.all([
    adminDb.collection('users').doc(userId).get(),
    adminDb
      .collection('auditLogs')
      .where('tenantId', '==', tenantId)
      .where('userId', '==', userId)
      .limit(5000)
      .get(),
  ]);

  const scopedCollections = [
    'invoices',
    'expenses',
    'projects',
    'tasks',
    'documents',
    'notifications',
  ];
  const tenantCollections = await Promise.all(
    scopedCollections.map(async (name) => {
      // P3-5a: these are top-level collections keyed by a `userId`/`ownerId` field, NOT tenant
      // subcollections. A Firebase uid is globally unique to one user in one tenant, so filtering
      // top-level by userId/ownerId returns exactly this subject's data (tenant-safe) and needs no
      // composite index. The previous `tenantRef.collection(name)` read subcollections that do not
      // exist, so DSAR exports silently returned no operational data.
      const byUser = await adminDb.collection(name).where('userId', '==', userId).limit(2000).get();
      const byOwner = await adminDb
        .collection(name)
        .where('ownerId', '==', userId)
        .limit(2000)
        .get();
      const dedup = new Map<string, Record<string, unknown>>();
      [...byUser.docs, ...byOwner.docs].forEach((doc) =>
        dedup.set(doc.id, { id: doc.id, ...doc.data() }),
      );
      return [name, Array.from(dedup.values())] as const;
    }),
  );

  return {
    metadata: {
      tenantId,
      userId,
      exportedAt: nowIso(),
    },
    user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
    auditLogs: auditLogs.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: toIso(doc.data().timestamp),
    })),
    tenantData: Object.fromEntries(tenantCollections),
    consentRecords: (
      await tenantRef
        .collection('complianceConsentRecords')
        .where('userId', '==', userId)
        .limit(500)
        .get()
    ).docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
}

export async function createDataExportRequest(input: {
  tenantId: string;
  requestedBy: string;
  subjectUserId: string;
  format: ExportFormat;
}) {
  const requestedAt = nowIso();
  const ref = adminDb
    .collection('tenants')
    .doc(input.tenantId)
    .collection('complianceDataExportRequests')
    .doc();

  await ref.set({
    tenantId: input.tenantId,
    requestedBy: input.requestedBy,
    subjectUserId: input.subjectUserId,
    format: input.format,
    status: 'processing',
    requestedAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    const data = await collectUserData(input.tenantId, input.subjectUserId);
    const payload =
      input.format === 'csv' ? toCsv(flattenForCsv(data)) : JSON.stringify(data, null, 2);

    const fileRef = adminDb
      .collection('tenants')
      .doc(input.tenantId)
      .collection('complianceDataExports')
      .doc(ref.id);

    await fileRef.set({
      tenantId: input.tenantId,
      requestId: ref.id,
      format: input.format,
      content: payload,
      createdAt: FieldValue.serverTimestamp(),
    });

    await ref.update({
      status: 'completed',
      completedAt: nowIso(),
      filePath: `complianceDataExports/${ref.id}`,
    });
    return { requestId: ref.id, format: input.format, content: payload };
  } catch (error) {
    await ref.update({
      status: 'failed',
      completedAt: nowIso(),
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

function flattenForCsv(data: Record<string, any>) {
  const rows: Record<string, unknown>[] = [];
  rows.push({ section: 'metadata', ...data.metadata });
  if (data.user) rows.push({ section: 'user', ...data.user });
  (data.auditLogs || []).forEach((entry: Record<string, unknown>) =>
    rows.push({ section: 'auditLogs', ...entry }),
  );
  Object.entries(data.tenantData || {}).forEach(([collection, items]) => {
    (items as Record<string, unknown>[]).forEach((entry) =>
      rows.push({ section: `tenantData:${collection}`, ...entry }),
    );
  });
  (data.consentRecords || []).forEach((entry: Record<string, unknown>) =>
    rows.push({ section: 'consentRecords', ...entry }),
  );
  return rows;
}

export async function createDataDeletionRequest(input: {
  tenantId: string;
  requestedBy: string;
  subjectUserId: string;
  mode: DeletionMode;
}) {
  const requestedAt = nowIso();
  const ref = adminDb
    .collection('tenants')
    .doc(input.tenantId)
    .collection('complianceDataDeletionRequests')
    .doc();
  await ref.set({
    tenantId: input.tenantId,
    requestedBy: input.requestedBy,
    subjectUserId: input.subjectUserId,
    mode: input.mode,
    status: 'processing',
    requestedAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    await deleteOrAnonymizeUserData(input.tenantId, input.subjectUserId, input.mode);
    await ref.update({ status: 'completed', completedAt: nowIso() });
    return { requestId: ref.id, status: 'completed' };
  } catch (error) {
    await ref.update({
      status: 'failed',
      completedAt: nowIso(),
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

async function deleteOrAnonymizeUserData(tenantId: string, userId: string, mode: DeletionMode) {
  const userRef = adminDb.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;

  if (mode === 'delete') {
    await userRef.delete();
  } else {
    await userRef.set(
      {
        email: `deleted+${userId}@redacted.local`,
        displayName: 'Deleted User',
        phone: null,
        photoURL: null,
        gdprDeletedAt: FieldValue.serverTimestamp(),
        piiRedacted: true,
      },
      { merge: true },
    );
  }

  const auditSnapshot = await adminDb
    .collection('auditLogs')
    .where('tenantId', '==', tenantId)
    .where('userId', '==', userId)
    .limit(5000)
    .get();

  if (!auditSnapshot.empty) {
    const batch = adminDb.batch();
    auditSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        userEmail: 'redacted@redacted.local',
        userName: 'Deleted User',
        metadata: {
          ...(doc.data().metadata || {}),
          piiRedacted: true,
        },
      });
    });
    await batch.commit();
  }
}

export async function exportAuditTrail(input: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  format?: 'json' | 'csv';
}) {
  let query: FirebaseFirestore.Query = adminDb
    .collection('auditLogs')
    .where('tenantId', '==', input.tenantId)
    .orderBy('timestamp', 'desc')
    .limit(5000);

  if (input.startDate) query = query.where('timestamp', '>=', Timestamp.fromDate(input.startDate));
  if (input.endDate) query = query.where('timestamp', '<=', Timestamp.fromDate(input.endDate));

  const snapshot = await query.get();
  const rows = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: toIso(doc.data().timestamp),
  }));

  if (input.format === 'csv') {
    return { format: 'csv' as const, content: toCsv(rows) };
  }
  return { format: 'json' as const, content: JSON.stringify(rows, null, 2) };
}

export async function generateComplianceReport(input: {
  tenantId: string;
  type: ComplianceReportType;
  periodStart: Date;
  periodEnd: Date;
  generatedBy: string;
}) {
  const ref = adminDb
    .collection('tenants')
    .doc(input.tenantId)
    .collection('complianceReports')
    .doc();
  await ref.set({
    tenantId: input.tenantId,
    type: input.type,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    status: 'pending',
    generatedBy: input.generatedBy,
    createdAt: nowIso(),
  });

  try {
    const tenantRef = adminDb.collection('tenants').doc(input.tenantId);
    const [policies, exportRequests, deleteRequests, consentRecords] = await Promise.all([
      tenantRef.collection('complianceRetentionPolicies').where('enabled', '==', true).get(),
      tenantRef
        .collection('complianceDataExportRequests')
        .where('requestedAt', '>=', input.periodStart.toISOString())
        .get(),
      tenantRef
        .collection('complianceDataDeletionRequests')
        .where('requestedAt', '>=', input.periodStart.toISOString())
        .get(),
      tenantRef
        .collection('complianceConsentRecords')
        .where('updatedAt', '>=', input.periodStart.toISOString())
        .get(),
    ]);

    const metrics = {
      activeRetentionPolicies: policies.size,
      exportRequests: exportRequests.size,
      completedExports: exportRequests.docs.filter((d) => d.data().status === 'completed').length,
      deletionRequests: deleteRequests.size,
      completedDeletions: deleteRequests.docs.filter((d) => d.data().status === 'completed').length,
      consentUpdates: consentRecords.size,
    };

    await ref.update({
      status: 'completed',
      metrics,
      details: {
        generatedAt: nowIso(),
      },
      completedAt: nowIso(),
    });

    return { reportId: ref.id, metrics };
  } catch (error) {
    await ref.update({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown',
      completedAt: nowIso(),
    });
    throw error;
  }
}

export async function runRetentionCleanupAcrossTenants() {
  const tenants = await adminDb.collection('tenants').get();
  const results = [];
  for (const doc of tenants.docs) {
    results.push(await runRetentionCleanup(doc.id));
  }
  return results;
}

export async function generateWeeklyComplianceReports() {
  const tenants = await adminDb.collection('tenants').get();
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);

  const results = [];
  for (const doc of tenants.docs) {
    const report = await generateComplianceReport({
      tenantId: doc.id,
      type: 'summary',
      periodStart: start,
      periodEnd: now,
      generatedBy: 'system:cron',
    });
    results.push({ tenantId: doc.id, ...report });
  }
  return results;
}
