import {
  DEMO_RESET_CONFIRMATION,
  DEMO_SEED_CONFIRMATION,
  DEMO_TENANT_ID,
} from '../lib/demo/safety';

function parseArgs(argv: string[]) {
  const parsed: { reset: boolean; confirmation: string } = {
    reset: argv.includes('--reset'),
    confirmation: '',
  };

  const inlineConfirmation = argv.find((arg) => arg.startsWith('--confirm='));
  if (inlineConfirmation) {
    parsed.confirmation = inlineConfirmation.slice('--confirm='.length);
  } else {
    const confirmationIndex = argv.findIndex((arg) => arg === '--confirm');
    if (confirmationIndex >= 0 && argv[confirmationIndex + 1]) {
      parsed.confirmation = argv[confirmationIndex + 1];
    }
  }

  if (argv.some((arg) => arg === '--tenant' || arg.startsWith('--tenant='))) {
    throw new Error(`The demo seeder is restricted to tenant ${DEMO_TENANT_ID}.`);
  }

  return parsed;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const expectedConfirmation = args.reset ? DEMO_RESET_CONFIRMATION : DEMO_SEED_CONFIRMATION;
  if (args.confirmation !== expectedConfirmation) {
    throw new Error(`Explicit confirmation required: --confirm=${expectedConfirmation}`);
  }

  // Delay Firebase Admin initialization until after CLI scope and confirmation checks pass.
  const { DEMO_USERS, resetDemoTenant, seedDemoTenant } = await import('../lib/demo/seed');
  const result = args.reset ? await resetDemoTenant() : await seedDemoTenant();

  console.log(`\n✅ Demo environment ${args.reset ? 'reset' : 'seeded'} successfully`);
  console.log(`Tenant ID: ${result.tenantId}`);
  console.log(`Demo accounts configured: ${DEMO_USERS.length}`);
  console.log('Credentials remain in the approved password manager and are never printed.');
  console.log('Counts:');
  Object.entries(result.counts).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  console.log(`Access URL: ${appUrl}/login\n`);
}

run().catch((error) => {
  console.error('❌ Demo tenant seed failed:', error);
  process.exit(1);
});
