import { DEMO_PASSWORD, seedDemoEnvironment } from "../lib/demo/seed";

function parseArgs(argv: string[]) {
  const parsed: { reset: boolean; tenantId: string } = {
    reset: argv.includes("--reset"),
    tenantId: "bizosto-demo",
  };

  const tenantIndex = argv.findIndex((arg) => arg === "--tenant");
  if (tenantIndex >= 0 && argv[tenantIndex + 1]) {
    parsed.tenantId = argv[tenantIndex + 1];
  }

  return parsed;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const result = await seedDemoEnvironment({ tenantId: args.tenantId, reset: args.reset });

  console.log("\n✅ Demo environment seeded successfully");
  console.log(`Tenant ID: ${result.tenantId}`);
  console.log("Demo users:");
  result.users.forEach((user) => {
    console.log(`- ${user.email} (${user.role}) | password: ${DEMO_PASSWORD}`);
  });
  console.log("Counts:");
  Object.entries(result.counts).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(`Access URL: ${appUrl}/login\n`);
}

run().catch((error) => {
  console.error("❌ Demo tenant seed failed:", error);
  process.exit(1);
});
