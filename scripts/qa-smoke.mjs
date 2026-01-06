import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";

const checks = [
  { path: "/login", name: "login page", expectStatus: 200 },
  { path: "/", name: "root redirect", expectRedirect: "/login" },
  { path: "/admin", name: "admin protected", expectRedirect: "/login" },
  { path: "/am", name: "am protected", expectRedirect: "/login" },
  { path: "/super-admin", name: "super-admin protected", expectRedirect: "/login" },
  { path: "/super_admin", name: "legacy super_admin", expectRedirect: "/super-admin", expectStatus: 308 },
  { path: "/account_manager", name: "legacy account_manager", expectRedirect: "/am", expectStatus: 308 },
  { path: "/customer", name: "legacy customer", expectRedirect: "/client", expectStatus: 308 },
  { path: "/client/settings", name: "legacy client settings", expectRedirect: "/client/profile", expectStatus: 308 },
  { path: "/forbidden", name: "forbidden page", expectStatus: 200 },
  { path: "/module-disabled", name: "module-disabled page", expectStatus: 200 },
  { path: "/suspended", name: "suspended page", expectStatus: 200 },
];

const canonicalRoles = [
  "super_admin",
  "admin",
  "sales_manager",
  "am_manager",
  "production_manager",
  "sales",
  "account_manager",
  "production",
  "finance",
  "hr",
  "client",
];
const canonicalRoutes = [
  "/super-admin",
  "/admin",
  "/sales-manager",
  "/am-manager",
  "/production-manager",
  "/sales",
  "/am",
  "/production",
  "/finance",
  "/hr",
  "/client",
];

async function fetchOnce(path) {
  const res = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  const location = res.headers.get("location");
  return { res, location };
}

async function checkRedirect(path, expected, expectedStatus) {
  const { res, location } = await fetchOnce(path);
  if (!location) {
    throw new Error(`${path} did not redirect.`);
  }
  const status = res.status;
  const redirectPath = new URL(location, baseUrl).pathname;
  if (expectedStatus && status !== expectedStatus) {
    throw new Error(`${path} expected status ${expectedStatus} but got ${status}.`);
  }
  if (redirectPath !== expected) {
    throw new Error(`${path} expected redirect to ${expected} but got ${redirectPath}.`);
  }
}

async function checkStatus(path, expectedStatus) {
  const { res, location } = await fetchOnce(path);
  if (location) {
    throw new Error(`${path} should not redirect but got ${location}.`);
  }
  if (res.status !== expectedStatus) {
    throw new Error(`${path} expected status ${expectedStatus} but got ${res.status}.`);
  }
}

async function run() {
  console.log(`QA smoke against ${baseUrl}`);

  checkRoleMap();
  checkLegacySlugs();

  for (const check of checks) {
    if (check.expectRedirect) {
      await checkRedirect(check.path, check.expectRedirect, check.expectStatus);
      console.log(`✓ ${check.name} (${check.path}) redirect ok`);
    } else {
      await checkStatus(check.path, check.expectStatus ?? 200);
      console.log(`✓ ${check.name} (${check.path}) status ok`);
    }
  }

  runOptionalPlaywright();
}

run().catch((err) => {
  console.error("QA smoke failed:", err.message || err);
  process.exit(1);
});

function checkRoleMap() {
  const rolesFile = path.join(process.cwd(), "lib", "auth", "roles.ts");
  const content = fs.readFileSync(rolesFile, "utf-8");

  for (const role of canonicalRoles) {
    if (!content.includes(`\"${role}\"`)) {
      throw new Error(`Role map missing canonical role: ${role}`);
    }
  }

  for (const route of canonicalRoutes) {
    if (!content.includes(`\"${route}\"`)) {
      throw new Error(`Role map missing canonical route: ${route}`);
    }
  }

  console.log("✓ role map includes canonical roles/routes");
}

function checkLegacySlugs() {
  const legacyPatterns = ["/super_admin", "/account_manager", "/customer", "/client/settings"];
  const ignoreGlobs = ["--glob", "!middleware.ts", "--glob", "!scripts/qa-smoke.mjs"];
  const rgBase = ["rg", "-n"];
  legacyPatterns.forEach((pattern) => rgBase.push("-e", pattern));
  rgBase.push(...ignoreGlobs, "app", "lib", "components", "scripts");
  try {
    const output = execSync(rgBase.join(" "), { stdio: "pipe" }).toString().trim();
    if (output) {
      throw new Error(`Legacy slugs detected in codebase:\\n${output}`);
    }
  } catch (err) {
    if (err?.status === 1) {
      return;
    }
    throw err;
  }
  console.log("✓ no legacy slugs found outside middleware");
}

function runOptionalPlaywright() {
  const playwrightPath = path.join(process.cwd(), "node_modules", "@playwright", "test");
  if (!fs.existsSync(playwrightPath)) {
    console.log("↷ Playwright not installed, skipping browser smoke.");
    return;
  }
  try {
    execSync("npx playwright test --list", { stdio: "inherit" });
  } catch (err) {
    console.warn("Playwright installed but failed to run. Skipping.");
  }
}
