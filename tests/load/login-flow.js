import { check, fail, sleep } from 'k6';
import { getBaseUrl, getScenarioThresholds, httpPost } from './config.js';

function getLoginCredentials() {
  const email = __ENV.LOAD_TEST_USER_EMAIL;
  const password = __ENV.LOAD_TEST_USER_PASSWORD;

  if (!email || !password) {
    fail('Missing LOAD_TEST_USER_EMAIL or LOAD_TEST_USER_PASSWORD environment variable.');
  }

  return { email, password };
}

export const options = {
  scenarios: {
    login_flow: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1m',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 120,
    },
  },
  thresholds: getScenarioThresholds(500),
};

export default function () {
  const credentials = getLoginCredentials();

  const payload = JSON.stringify({
    email: credentials.email,
    password: credentials.password,
  });

  const response = httpPost('/api/auth/login', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(response, {
    'login: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'login: has session token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body?.token || body?.session?.token || body?.user?.uid);
      } catch {
        return false;
      }
    },
    'login: response <500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    [`${__ENV.LOAD_TEST_RESULTS_DIR || 'load-results'}/login-flow-summary.json`]: JSON.stringify(
      data,
      null,
      2,
    ),
  };
}

getBaseUrl();
