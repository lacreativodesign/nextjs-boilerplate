/**
 * Resolves the Cloud Storage bucket used for backups and restore.
 *
 * Prefers the explicit server var, then the public Firebase bucket (which is always
 * configured), then the Admin SDK default. It deliberately does NOT fall back to a
 * hardcoded 'bizosto-backups' bucket — that bucket does not exist, so the old
 * fallback silently sent the backup cron and restore to a missing bucket.
 */
export function getBackupBucketName(): string | undefined {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    undefined
  );
}
