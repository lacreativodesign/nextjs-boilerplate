# Performance Load Testing

This repository uses `k6` for repeatable performance validation against the staging stack before production rollout.

## Gates

A staging build is considered healthy only when all of the following are true:

- Supports at least **100 concurrent users** without service degradation.
- API `p95` response time remains below **500ms** (`1000ms` for file upload).
- Error rate remains below **1%**.
- No sustained memory growth during 5+ minute runs.
- Database connection pool saturation does not exceed operational limits.

## Scenarios

Load scripts are stored in `tests/load/` and map directly to product-critical paths:

- `login-flow.js` → 100 users/minute
- `dashboard-load.js` → 50 concurrent users
- `invoice-list.js` → 100 requests/second
- `search.js` → 50 concurrent searches
- `api-endpoints.js` → 200 requests/second
- `file-upload.js` → 10 concurrent uploads

## CI/CD integration

Workflow: `.github/workflows/load-test.yml`

- Runs by manual trigger or via `workflow_call` from deployment workflow.
- Enforces script thresholds (fail-fast on regression).
- Uploads summary artifacts (`load-results/*.json`) for trend analysis.

To enforce this before production deployment, invoke this workflow from the production deploy pipeline and block deploy unless it succeeds.

## Metrics to record per run

Collect and trend the following in monitoring dashboards and release notes:

- `http_req_duration` percentiles (`p50`, `p95`, `p99`)
- `http_reqs` and effective RPS
- `http_req_failed` rate
- VU utilization / saturation
- Node runtime memory and CPU
- Database connection pool usage and wait time
