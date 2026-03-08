# Sentry Production Monitoring Runbook

## 1) Sentry project bootstrap

1. Create a Sentry account and organization.
2. Create a **Next.js** project named `bizosto-erp-web`.
3. Create a server-side DSN + public DSN and store the values in Vercel environment variables.
4. Create and store a project auth token with `project:releases` and `org:read` scope for source map upload.

## 2) Required environment variables

Set these in Vercel for each environment (`production`, `preview`, `development`):

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_ENVIRONMENT`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `NEXT_PUBLIC_SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`

## 3) Alerting policy

Create these alert rules in Sentry project settings:

### Error alerts

- **Critical errors to email**
  - Condition: `event.level is error` and `issue.frequency > 5 in 5m`.
  - Action: send email to on-call engineering list.

- **Spike detection to Slack**
  - Condition: issue frequency above historical baseline.
  - Action: send to `#erp-alerts` Slack channel.

### Performance alerts

- **API latency degradation**
  - Condition: transaction `op:http.server` p95 > 1500ms for 10m.
  - Action: send to `#erp-alerts` and email on-call list.

- **Firestore query degradation**
  - Condition: span `db.query` p95 > 500ms for 10m.
  - Action: send to `#erp-alerts`.

## 4) Slack integration

1. In Sentry: **Settings → Integrations → Slack**.
2. Connect workspace and authorize project access.
3. Bind project alert routing to `#erp-alerts`.
4. Restrict mentions to `@oncall-erp` group for production alerts.

## 5) Verification checklist

- Trigger a test error from browser and confirm issue ingestion.
- Trigger a server-side API error and validate tenant/user tags.
- Validate stack traces resolve to source files (source maps uploaded).
- Validate transaction traces contain API + Firestore spans.
- Validate alert delivery to email + Slack.
- Confirm request cookies/headers are not present in event payloads.
