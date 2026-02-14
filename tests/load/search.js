import { sleep } from 'k6';
import { checkJsonResponse, getAuthHeaders, getScenarioThresholds, httpGet } from './config.js';

const searchTerms = ['invoice', 'customer', 'payment', 'project', 'subscription'];

export const options = {
  scenarios: {
    search: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
  },
  thresholds: getScenarioThresholds(500),
};

export default function () {
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  const response = httpGet(`/api/search?q=${encodeURIComponent(term)}`, {
    headers: getAuthHeaders(),
  });

  checkJsonResponse(response, 'search', 500);
  sleep(1);
}

export function handleSummary(data) {
  return {
    [`${__ENV.LOAD_TEST_RESULTS_DIR || 'load-results'}/search-summary.json`]: JSON.stringify(
      data,
      null,
      2,
    ),
  };
}
