import { AggregateField } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { type PlanTier } from '@/lib/tenant/plan-access';
import { plans, normalizePlanKey } from '@/lib/billing/plans';

/**
 * Plan storage-limit enforcement.
 *
 * S11: storage is sold on every tier — Starter 20GB, Pro 75GB, Enterprise 250GB — but
 * nothing anywhere metered or enforced it. A Starter tenant could upload without bound.
 * That is both a revenue leak (storage is a paid dimension of the plan) and an uncapped
 * cost: every byte lives in the Firebase Storage bucket and is billed to Bizosto.
 *
 * PR4 completes that accounting. Usage is the sum of every LIVE metadata record that
 * stands for a distinct physical object in the bucket:
 *
 *   - `files`               project/AM/production deliverables and client uploads (`size`)
 *   - `employeeDocuments`   HR documents (`size`)
 *   - `erp_file_versions`   the chunked managed-file store (`size`)
 *   - `documents`           the general document library (`fileSize`)
 *
 * Two of those were previously unmetered, and both were real quota bypasses:
 *
 *   PR4-A. `documents` was never counted and /api/documents/upload never checked the
 *   limit, so every byte stored through the document library — the live upload path
 *   behind the UI — was free.
 *
 *   PR4-B. The managed-file store was counted off `erp_files.size`, which only ever
 *   holds the CURRENT version's size. FileManager.storeVersion() writes a NEW physical
 *   object per version (`.../v{n}-{ts}-{name}`) and never removes the old one — indeed
 *   restoreVersion() depends on it still being there. Ten versions of a 40MB file
 *   billed 400MB and metered 40MB. Counting `erp_file_versions` instead counts each
 *   object exactly once: the current version is one row in that collection, so the
 *   `erp_files` row must NOT also be counted or the current version is double-charged.
 *
 * PR4 remediation added three more, after each ancillary surface was examined rather
 * than waved through as "operational":
 *
 *   `importJobs`          tenant-uploaded payloads, <=25MB each, one object per import,
 *                         no retention or cleanup anywhere — unbounded and
 *                         tenant-controlled.
 *   `exportJobs`          tenant-triggered outputs sized by the tenant's own data, one
 *                         object per export, no cleanup — unbounded and
 *                         tenant-controlled.
 *   `docusignEnvelopes`   signed contracts: persistent tenant BUSINESS documents, one
 *                         per envelope, no cleanup.
 *
 * Two surfaces stay outside paid quota, with the reasons recorded so the decision can be
 * re-examined rather than inherited:
 *
 *   tenant branding logo  written by super_admin to a FIXED path and overwritten in
 *                         place, <=2MB. Bounded platform overhead; a tenant cannot
 *                         accumulate them.
 *   support screenshots   <=3MB, exactly one per ticket (the path is the ticket id),
 *                         behind strict rate limiting and content-hash dedup, and
 *                         attached to the PLATFORM support desk rather than to tenant
 *                         business data. Metering it would also let a full workspace
 *                         quietly lose the ability to report a problem.
 *
 * Limits come from the canonical catalog in lib/billing/plans.ts (limits.storage, in
 * bytes) so there is a single source of truth, and no upload route carries a pricing
 * table of its own.
 *
 * Deletion. Quota is recovered only when the bytes actually go: every delete path that
 * clears a record now removes the underlying Storage object first (see
 * StorageService.deleteFile and the files/employeeDocuments delete routes), so a
 * metadata-only delete can no longer manufacture free quota while Bizosto keeps paying
 * for the object.
 *
 * Concurrency. The advisory checkStorageLimit() read this module used to export is gone.
 * A read cannot stop two simultaneous uploads from both observing the same free space,
 * and every caller has moved to lib/billing/storage-reservation.ts, which decides inside
 * a Firestore transaction. Leaving the read exported would leave the race one import
 * away from coming back. What remains here is the accounting — the byte sources, the
 * plan ceiling and the refusal contract — that the reservation is built on.
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

/** Resolves the entitled byte ceiling for a plan from the canonical catalog. */
export function storageLimitForPlan(plan: PlanTier): number {
  // trial mirrors starter storage; paid tiers come straight from plans.ts.
  const key = normalizePlanKey(plan);
  const limit = plans[key]?.limits?.storage;
  // Fail closed on a malformed catalog entry: fall back to the smallest tier, never to
  // "unlimited".
  return typeof limit === 'number' ? limit : plans.starter.limits.storage;
}

/** Coerces any caller-supplied byte count to a safe, non-negative integer. */
export function normalizeBytes(value: unknown): number {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
}

/**
 * The tenant's plan document plus one aggregate query per byte-bearing surface.
 *
 * Exposed as a single set so that the non-transactional read (getTenantStorageUsage)
 * and the transactional reservation both count the SAME sources. A surface added here
 * is metered everywhere at once; there is no second place to remember.
 *
 * Collection ids are written as string literals on purpose: the Firestore inventory
 * generator (scripts/generate-firestore-schema.mjs) only resolves static ids, so
 * routing them through constants would drop real collections out of the generated
 * schema docs.
 */
export function tenantStorageSources(tenantId: string) {
  const id = String(tenantId ?? '').trim();

  return {
    tenantRef: adminDb.collection('tenants').doc(id),
    byteSources: [
      // Project deliverables, AM/production files and client uploads.
      adminDb
        .collection('files')
        .where('tenantId', '==', id)
        .where('isDeleted', '==', false)
        .aggregate({ total: AggregateField.sum('size') }),
      // HR employee documents.
      adminDb
        .collection('employeeDocuments')
        .where('tenantId', '==', id)
        .where('isDeleted', '==', false)
        .aggregate({ total: AggregateField.sum('size') }),
      // Managed-file store: one row per physical object, every version included.
      adminDb
        .collection('erp_file_versions')
        .where('tenantId', '==', id)
        .aggregate({ total: AggregateField.sum('size') }),
      // Document library. Deleted documents carry a deletedAt timestamp AND have had
      // their Storage object removed, so excluding them tracks the real bytes.
      adminDb
        .collection('documents')
        .where('tenantId', '==', id)
        .where('deletedAt', '==', null)
        .aggregate({ total: AggregateField.sum('fileSize') }),
      // Bulk-import payloads. Tenant-uploaded, up to 25MB each, one object per import,
      // and nothing purges them — so they accumulate without bound until metered.
      adminDb
        .collection('importJobs')
        .where('tenantId', '==', id)
        .aggregate({ total: AggregateField.sum('size') }),
      // Bulk-export outputs. Tenant-triggered, sized by the tenant's own data, one
      // object per export, and nothing purges them either.
      adminDb
        .collection('exportJobs')
        .where('tenantId', '==', id)
        .aggregate({ total: AggregateField.sum('size') }),
      // DocuSign signed documents: persistent tenant business records, one per envelope,
      // never purged. The subcollection lives under the tenant document, so it is
      // tenant-scoped by construction and needs no filter of its own.
      adminDb
        .collection('tenants')
        .doc(id)
        .collection('docusignEnvelopes')
        .aggregate({ total: AggregateField.sum('signedDocumentSize') }),
    ],
  };
}

/** Sums the aggregate snapshots returned by `tenantStorageSources().byteSources`. */
export function totalStorageBytes(
  snapshots: Array<{ data: () => { total?: number | null } }>,
): number {
  return snapshots.reduce((running, snap) => running + normalizeBytes(snap.data()?.total), 0);
}

/** Total live bytes stored by a tenant across every file-bearing collection. */
export async function getTenantStorageUsage(tenantId: string): Promise<number> {
  const { byteSources } = tenantStorageSources(tenantId);
  const snapshots = await Promise.all(byteSources.map((query) => query.get()));
  return totalStorageBytes(snapshots);
}

function toGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/**
 * Standard 403 body for an exceeded storage limit, with clear upgrade guidance.
 *
 * The shape is the machine-readable contract the UI keys off: a stable `error` code
 * plus the three numbers needed to explain the refusal. It carries this tenant's own
 * figures only — never anything about another tenant.
 */
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
