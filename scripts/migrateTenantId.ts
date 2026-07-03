import { migrateMissingTenantIds } from '@/lib/tenant/migration';

async function run() {
  const argTenantId = process.argv[2];
  const envTenantId = process.env.DEFAULT_TENANT_ID;
  const tenantId = argTenantId || envTenantId;

  if (!tenantId) {
    console.error('Missing DEFAULT_TENANT_ID. Usage: tsx scripts/migrateTenantId.ts <TENANT_ID>');
    process.exit(1);
  }

  console.log(`[tenant-migration] starting for tenant: ${tenantId}`);
  await migrateMissingTenantIds(tenantId);
  console.log('[tenant-migration] completed');
}

run().catch((err) => {
  console.error('Tenant migration failed:', err);
  process.exit(1);
});
