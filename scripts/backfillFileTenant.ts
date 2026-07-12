import { backfillFileTenantIds } from '@/lib/tenant/backfill-file-tenant';

async function run() {
  console.log('[file-tenant-backfill] starting');
  const result = await backfillFileTenantIds();
  console.log(
    `[file-tenant-backfill] completed: scanned=${result.scanned} updated=${result.updated} skippedNoProject=${result.skippedNoProject}`,
  );
}

run().catch((err) => {
  console.error('File tenant backfill failed:', err);
  process.exit(1);
});
