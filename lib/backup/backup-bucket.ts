/**
 * Backup/restore bucket resolution.
 *
 * This now delegates to the single storage-bucket resolver so backup, restore and every other
 * storage path agree on which bucket they use. The name is kept for existing importers
 * (app/api/cron/backup, lib/backup/restore).
 */
import { getStorageBucketName } from '@/lib/storage/bucket';

export function getBackupBucketName(): string | undefined {
  return getStorageBucketName();
}
