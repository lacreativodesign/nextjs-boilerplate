import { sleep } from 'k6';
import { checkJsonResponse, getAuthHeaders, getScenarioThresholds, httpGet } from './config.js';

export const options = {
  scenarios: {
    invoice_list: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 60,
      maxVUs: 240,
    },
  },
  thresholds: getScenarioThresholds(500),
};

export default function () {
  const response = httpGet('/api/finance/invoices', {
    headers: getAuthHeaders(),
  });

  checkJsonResponse(response, 'invoice list', 500);
  sleep(1);
}

export function handleSummary(data) {
  return {
    [`${__ENV.LOAD_TEST_RESULTS_DIR || 'load-results'}/invoice-list-summary.json`]: JSON.stringify(
      data,
      null,
      2,
    ),
  };
}
