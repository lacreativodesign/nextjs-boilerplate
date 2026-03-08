import { sleep } from 'k6';
import { checkJsonResponse, getAuthHeaders, getScenarioThresholds, httpGet } from './config.js';

export const options = {
  scenarios: {
    dashboard_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
  },
  thresholds: getScenarioThresholds(500),
};

export default function () {
  const response = httpGet('/api/dashboard', {
    headers: getAuthHeaders(),
  });

  checkJsonResponse(response, 'dashboard', 500);
  sleep(1);
}

export function handleSummary(data) {
  return {
    [`${__ENV.LOAD_TEST_RESULTS_DIR || 'load-results'}/dashboard-load-summary.json`]:
      JSON.stringify(data, null, 2),
  };
}
