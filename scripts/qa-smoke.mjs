const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3000';

const checks = [
  { path: '/login', name: 'login page', expectStatus: 200 },
  { path: '/', name: 'root redirect', expectRedirect: '/login' },
  { path: '/admin', name: 'admin protected', expectRedirect: '/login' },
  { path: '/am', name: 'am protected', expectRedirect: '/login' },
  {
    path: '/account_manager',
    name: 'legacy account_manager',
    expectRedirect: '/am',
    expectStatus: 308,
  },
  { path: '/customer', name: 'legacy customer', expectRedirect: '/client', expectStatus: 308 },
  { path: '/forbidden', name: 'forbidden page', expectStatus: 200 },
  { path: '/module-disabled', name: 'module-disabled page', expectStatus: 200 },
  { path: '/suspended', name: 'suspended page', expectStatus: 200 },
];

async function fetchOnce(path) {
  const res = await fetch(new URL(path, baseUrl), { redirect: 'manual' });
  const location = res.headers.get('location');
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

  for (const check of checks) {
    if (check.expectRedirect) {
      await checkRedirect(check.path, check.expectRedirect, check.expectStatus);
      console.log(`✓ ${check.name} (${check.path}) redirect ok`);
    } else {
      await checkStatus(check.path, check.expectStatus ?? 200);
      console.log(`✓ ${check.name} (${check.path}) status ok`);
    }
  }
}

run().catch((err) => {
  console.error('QA smoke failed:', err.message || err);
  process.exit(1);
});
