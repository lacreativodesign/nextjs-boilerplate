# k6 Load Testing

## Prerequisites

Install `k6` locally before running tests.

### macOS

```bash
brew install k6
```

### Ubuntu/Debian

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
sudo sh -c 'echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" > /etc/apt/sources.list.d/k6.list'
sudo apt update
sudo apt install k6
```

### Windows (Chocolatey)

```powershell
choco install k6
```

## Environment setup

1. Copy `tests/load/.env.example` to a secure local `.env.load` file.
2. Provide staging URL, API token, and load-test credentials.
3. Export the variables before running a scenario:

```bash
set -a
source .env.load
set +a
```

## Scenarios

| Scenario                       | Target                 |
| ------------------------------ | ---------------------- |
| `tests/load/login-flow.js`     | 100 users/minute       |
| `tests/load/dashboard-load.js` | 50 concurrent users    |
| `tests/load/invoice-list.js`   | 100 requests/second    |
| `tests/load/search.js`         | 50 concurrent searches |
| `tests/load/api-endpoints.js`  | 200 requests/second    |
| `tests/load/file-upload.js`    | 10 concurrent uploads  |

## Run tests

```bash
npm run load:test:login
npm run load:test:dashboard
npm run load:test:invoice
npm run load:test:search
npm run load:test:api
npm run load:test:upload
npm run load:test:all
```

Each scenario enforces thresholds:

- `p95 < 500ms` for standard endpoints.
- `p95 < 1000ms` for file upload.
- `p99` guardrail and `<1%` error rate for all scenarios.

## Metrics to review

- Response time percentiles (`p50`, `p95`, `p99`)
- Throughput (requests/second)
- Error rate
- Concurrent user/VU saturation
- Application and database telemetry (connection pool pressure, CPU/memory)

Summary JSON files are written to `LOAD_TEST_RESULTS_DIR` for CI artifact retention and trend analysis.
