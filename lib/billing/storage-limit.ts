import { AggregateField } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizePlan, type PlanTier } from '@/lib/tenant/plan-access';
import { plans, normalizePlanKey } from '@/lib/billing/plans';

/**
 * Plan storage-limit enforcement.
 *
 * S11: storage is sold on every tier — Starter 20GB, Pro 75GB, Enterprise 250GB — but
 * nothing anywhere metered or enforced it. A Starter tenant could upload without bound.
 * That is both a revenue leak (storage is a paid dimension of the plan) and an uncapped
 * cost: every byte lives in the Firebase Storage bucket and is billed to Bizosto.
 *
 * Usage is the sum of the `size` field across the tenant's live file records:
 *   - `files`             (project deliverables, AM files, client uploads)
 *   - `employeeDocuments` (HR documents)
 *
 * Limits come from the canonical catalog in lib/billing/plans.ts (limits.storage, in
 * bytes) so there is a single source of truth. Soft-deleted records are excluded, which
 * matches what a customer expects when they delete a file. NOTE: nothing currently purges
 * the underlying object from the bucket on soft-delete, so reclaimed quota does not yet
 * reclaim real bytes — a retention/purge job is tracked separately.
 */

export const STORAGE_LIMIT_EXCEEDED = 'storage_limit_exceeded';

export interface StorageLimitCheck {
  ok: boolean;
  /** Bytes. A negative limit means unlimited. */
  limit: number;
  /** Bytes already consumed by the tenant. */
  used: number;
  /** Bytes the current upload would add. */
  incoming: number;
  plan: PlanTier;
}

function storageLimitForPlan(plan: PlanTier): number {
  // trial mirrors starter storage; paid tiers come straight from plans.ts.
  const key = normalizePlanKey(plan);
  const limit = plans[key]?.limits?.storage;
  // Fail closed on a malformed catalog entry: fall back to the smallest tier, never to
  // "unlimited".
  return typeof limit === 'number' ? limit : plans.starter.limits.storage;
}

async function sumCollectionBytes(collection: string, tenantId: string): Promise<number> {
  const snap = await adminDb
    .collection(collection)
    .where('tenantId', '==', tenantId)
    .where('isDeleted', '==', false)
    .aggregate({ total: AggregateField.sum('size') })
    .get();

  const total = Number(snap.data().total || 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * P0-2: the chunked managed-file store (`erp_files`, written by lib/files/file-manager.ts)
 * was never counted, so every byte uploaded through /api/files/upload was free. It marks
 * deletion with `deletedAt: null` rather than `isDeleted: false`, hence the separate query.
 */
async function sumManagedFileBytes(tenantId: string): Promise<number> {
  const snap = await adminDb
    .collection('erp_files')
    .where('tenantId', '==', tenantId)
    .where('deletedAt', '==', null)
    .aggregate({ total: AggregateField.sum('size') })
    .get();

  const total = Number(snap.data().total || 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/** Total live bytes stored by a tenant across every file-bearing collection. */
export async function getTenantStorageUsage(tenantId: string): Promise<number> {
  const [fileBytes, hrDocumentBytes, managedFileBytes] = await Promise.all([
    sumCollectionBytes('files', tenantId),
    sumCollectionBytes('employeeDocuments', tenantId),
    sumManagedFileBytes(tenantId),
  ]);
  return fileBytes + hrDocumentBytes + managedFileBytes;
}

/** Checks whether the tenant can store `incomingBytes` more without exceeding its plan. */
export async function checkStorageLimit(
  tenantId: string,
  incomingBytes: number,
): Promise<StorageLimitCheck> {
  const incoming =
    Number.isFinite(incomingBytes) && incomingBytes > 0 ? Math.floor(incomingBytes) : 0;

  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  const plan = normalizePlan(tenantSnap.data()?.plan);
  const limit = storageLimitForPlan(plan);

  if (limit < 0) {
    return { ok: true, limit, used: 0, incoming, plan };
  }

  const used = await getTenantStorageUsage(tenantId);
  return { ok: used + incoming <= limit, limit, used, incoming, plan };
}

function toGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/** Standard 403 body for an exceeded storage limit, with clear upgrade guidance. */
export function storageLimitResponseBody(check: StorageLimitCheck) {
  return {
    ok: false,
    error: STORAGE_LIMIT_EXCEEDED,
    message: `Your ${check.plan} plan includes ${toGb(check.limit)}GB of storage and you have used ${toGb(
      check.used,
    )}GB. This upload needs a further ${toGb(
      check.incoming,
    )}GB. Remove some files or upgrade your plan to add more storage.`,
    limit: check.limit,
    used: check.used,
    incoming: check.incoming,
    plan: check.plan,
  };
}
