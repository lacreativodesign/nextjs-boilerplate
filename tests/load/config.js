import http from 'k6/http';
import { check, fail } from 'k6';

const defaultTimeout = '30s';

export function getBaseUrl() {
  const url = __ENV.LOAD_TEST_BASE_URL;

  if (!url) {
    fail('Missing LOAD_TEST_BASE_URL environment variable.');
  }

  return url.replace(/\/$/, '');
}

export function getAuthHeaders() {
  const token = __ENV.API_TOKEN;

  if (!token) {
    fail('Missing API_TOKEN environment variable.');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function getScenarioThresholds(responseTargetMs = 500) {
  return {
    http_req_duration: [
      `p(95)<${responseTargetMs}`,
      `p(99)<${Math.max(responseTargetMs * 2, 1000)}`,
    ],
    http_req_failed: ['rate<0.01'],
  };
}

export function checkJsonResponse(response, operationName, responseTargetMs = 500) {
  check(response, {
    [`${operationName}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${operationName}: response time < ${responseTargetMs}ms`]: (r) =>
      r.timings.duration < responseTargetMs,
  });
}

export function httpGet(path, params = {}) {
  return http.get(`${getBaseUrl()}${path}`, {
    timeout: defaultTimeout,
    ...params,
  });
}

export function httpPost(path, body, params = {}) {
  return http.post(`${getBaseUrl()}${path}`, body, {
    timeout: defaultTimeout,
    ...params,
  });
}
