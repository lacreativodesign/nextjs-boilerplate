import { backfillHrDocumentTenantIds } from '@/lib/tenant/backfill-hr-document-tenant';

async function run() {
  console.log('[hr-document-tenant-backfill] starting');
  const result = await backfillHrDocumentTenantIds();
  console.log(
    `[hr-document-tenant-backfill] completed: scanned=${result.scanned} updated=${result.updated} skippedNoEmployee=${result.skippedNoEmployee}`,
  );
}

run().catch((err) => {
  console.error('HR document tenant backfill failed:', err);
  process.exit(1);
});
