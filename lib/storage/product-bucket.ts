import { adminStorage } from '@/lib/firebaseAdmin';
import { getStorageBucketName } from '@/lib/storage/bucket';

/**
 * P0-07 — the ONE way normal product code gets a Cloud Storage bucket handle.
 *
 * Before this, every call site spelled out
 *
 *   bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket()
 *
 * and some (tenant branding) skipped the resolver entirely and called
 * `adminStorage.bucket()`. The Admin app in lib/firebaseAdmin.ts is initialised WITHOUT a
 * `storageBucket` option, so the no-argument form is not "the default bucket" — it is
 * whatever firebase-admin decides for an unset option, which today is a thrown "Bucket
 * name not specified" error at request time and could be a different bucket after a
 * future edit to that initialisation. Neither is a decision anybody made.
 *
 * This fails closed instead: no configured bucket, no handle. The P0-01 environment
 * contract (lib/firebase/environment.mjs) already requires FIREBASE_STORAGE_BUCKET /
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to name the environment's own bucket — in
 * production, exactly `la-creativo-erp.firebasestorage.app` — so a runtime that reaches
 * this without one is misconfigured, and writing tenant bytes to a guessed bucket is the
 * worst available response to that.
 *
 * Backups resolve through lib/backup/backup-bucket.ts, which is deliberately separate so
 * the backup location can diverge from product storage without touching product code.
 * __tests__/lib/p0-07-canonical-bucket.test.ts fails if a product path bypasses this.
 */
export class StorageBucketNotConfiguredError extends Error {
  constructor() {
    super(
      'Cloud Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET (or ' +
        'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) to this environment’s bucket.',
    );
    this.name = 'StorageBucketNotConfiguredError';
  }
}

export function productStorageBucket() {
  const bucketName = getStorageBucketName();
  if (!bucketName) throw new StorageBucketNotConfiguredError();
  return adminStorage.bucket(bucketName);
}
