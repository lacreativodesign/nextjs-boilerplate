import {
  assertGoldenTenant,
  assertIntendedFirebaseProject,
  DEMO_TENANT_ID,
  seedDemoEnvironment,
} from '../lib/demo/seed';

function parseArgs(argv: string[]) {
  return { reset: argv.includes('--reset') };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const project = assertIntendedFirebaseProject();
  // The tenant is fixed, not an argument: see assertGoldenTenant in lib/demo/seed.ts.
  const tenantId = assertGoldenTenant(DEMO_TENANT_ID);

  const result = await seedDemoEnvironment({ tenantId, reset: args.reset });

  console.log('\nDemo environment seeded successfully');
  console.log(`Firebase project: ${project}`);
  console.log(`Tenant ID: ${result.tenantId}`);
  console.log('Demo users:');
  result.users.forEach((user) => {
    console.log(`- ${user.email} (${user.role})`);
  });
  console.log('Counts:');
  Object.entries(result.counts).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
  console.log('Demo credentials are supplied through E2E_DEMO_PASSWORD and are never printed.');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  console.log(`Access URL: ${appUrl}/login\n`);
}

run().catch((error) => {
  console.error('Demo tenant seed failed:', error);
  process.exit(1);
});
