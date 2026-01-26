const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";

const checks = [
  { path: "/login", name: "login page", expectStatus: 200 },
  { path: "/", name: "root redirect", expectRedirect: "/login" },
  { path: "/admin", name: "admin protected", expectRedirect: "/login" },
  { path: "/am", name: "am protected", expectRedirect: "/login" },
  { path: "/sales_manager", name: "sales manager protected", expectRedirect: "/login" },
  { path: "/super_admin", name: "super admin protected", expectRedirect: "/login" },
  { path: "/am_manager", name: "am manager protected", expectRedirect: "/login" },
  { path: "/production_manager", name: "production manager protected", expectRedirect: "/login" },
  { path: "/account_manager", name: "legacy account_manager", expectRedirect: "/am", expectStatus: 308 },
  { path: "/customer", name: "legacy customer", expectRedirect: "/client", expectStatus: 308 },
  { path: "/forbidden", name: "forbidden page", expectStatus: 200 },
  { path: "/module-disabled", name: "module-disabled page", expectStatus: 200 },
  { path: "/suspended", name: "suspended page", expectStatus: 200 },
];

const apiChecks = [
  { path: "/api/notifications/list", name: "notifications list", allow: [200, 401, 403] },
  { path: "/api/admin/overview", name: "admin overview", allow: [200, 401, 403] },
  { path: "/api/admin/reports/overview", name: "reports overview", allow: [200, 401, 403] },
  { path: "/api/super_admin/system-health", name: "system health", allow: [200, 401, 403] },
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

async function checkAllowedStatus(path, allowedStatuses) {
  const { res } = await fetchOnce(path);
  if (!allowedStatuses.includes(res.status)) {
    throw new Error(`${path} expected status ${allowedStatuses.join("/")} but got ${res.status}.`);
  }
}

async function run() {
  console.log(`QA smoke against ${baseUrl}`);

  for (const check of checks) {
    if (check.expectRedirect) {
      await checkRedirect(check.path, check.expectRedirect, check.expectStatus);
      console.log(`✓ ${check.name} (${check.path}) redirect ok`);
    } else {
      await checkStatus(check.path, check.expectStatus ?? 200);
      console.log(`✓ ${check.name} (${check.path}) status ok`);
    }
  }

  for (const check of apiChecks) {
    await checkAllowedStatus(check.path, check.allow);
    console.log(`✓ ${check.name} (${check.path}) status ok`);
  }
}

run().catch((err) => {
  console.error("QA smoke failed:", err.message || err);
  process.exit(1);
});
