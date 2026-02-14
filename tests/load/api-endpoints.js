import http from 'k6/http';
import { sleep } from 'k6';
import { getAuthHeaders, getBaseUrl, getScenarioThresholds } from './config.js';

const endpointPaths = ['/api/dashboard', '/api/finance/invoices', '/api/projects', '/api/clients'];

export const options = {
  scenarios: {
    api_endpoints: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 350,
    },
  },
  thresholds: getScenarioThresholds(500),
};

export default function () {
  const baseUrl = getBaseUrl();
  const headers = getAuthHeaders();
  const requests = endpointPaths.map((path) => ['GET', `${baseUrl}${path}`, null, { headers }]);

  const responses = http.batch(requests);
  responses.forEach((response, index) => {
    const endpoint = endpointPaths[index];

    if (response.status < 200 || response.status >= 300 || response.timings.duration >= 500) {
      throw new Error(
        `Endpoint ${endpoint} failed under load (status=${response.status}, duration=${response.timings.duration}ms)`,
      );
    }
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    [`${__ENV.LOAD_TEST_RESULTS_DIR || 'load-results'}/api-endpoints-summary.json`]: JSON.stringify(
      data,
      null,
      2,
    ),
  };
}
