import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthHeaders, getBaseUrl, getScenarioThresholds } from './config.js';

const uploadFixture = open('./fixtures/upload-sample.txt', 'b');

export const options = {
  scenarios: {
    file_upload: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
    },
  },
  thresholds: getScenarioThresholds(1000),
};

export default function () {
  const headers = getAuthHeaders();
  delete headers['Content-Type'];

  const data = {
    file: http.file(uploadFixture, `load-test-${__VU}-${Date.now()}.txt`, 'text/plain'),
    category: 'invoice-attachment',
  };

  const response = http.post(`${getBaseUrl()}/api/files/upload`, data, {
    headers,
    timeout: '60s',
  });

  check(response, {
    'upload: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'upload: response <1000ms': (r) => r.timings.duration < 1000,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    [`${__ENV.LOAD_TEST_RESULTS_DIR || 'load-results'}/file-upload-summary.json`]: JSON.stringify(
      data,
      null,
      2,
    ),
  };
}
