# Environment-variable matrix

Evidence date: 2026-08-24. Names only are recorded; no configured value was
printed, stored or committed. Static references, dynamic access, Next.js,
scripts, tests and GitHub workflows were inventoried. The connected Vercel
metadata did not provide a safe complete name listing, so configured presence
and correctness remain `OWNER PENDING`.

## Mandatory application launch contract

| Name                                  | Phase          | Requirement                                                  | Evidence state                       |
| ------------------------------------- | -------------- | ------------------------------------------------------------ | ------------------------------------ |
| `BIZOSTO_ENVIRONMENT`                 | Runtime        | Exact `production`, `staging`, `development` or `test` label | **CODE READY**                       |
| `FIREBASE_ADMIN_KEY`                  | Runtime secret | Environment-specific service account JSON                    | **OWNER PENDING**                    |
| `FIREBASE_EXPECTED_PROJECT_ID`        | Runtime        | Exact project for this target                                | **CODE READY / OWNER PENDING VALUE** |
| `FIREBASE_PRODUCTION_PROJECT_ID`      | Runtime        | Production boundary on every target                          | **CODE READY / OWNER PENDING VALUE** |
| `FIREBASE_EXPECTED_STORAGE_BUCKET`    | Runtime        | Exact bucket for this target                                 | **CODE READY / OWNER PENDING VALUE** |
| `FIREBASE_PRODUCTION_STORAGE_BUCKET`  | Runtime        | Production bucket boundary                                   | **CODE READY / OWNER PENDING VALUE** |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`     | Build/browser  | Environment-specific browser project                         | **OWNER PENDING**                    |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Build/browser  | Environment-specific browser bucket                          | **OWNER PENDING**                    |
| `CRON_SECRET`                         | Runtime secret | Distinct value, minimum 32 characters                        | **OWNER PENDING**                    |
| `DAILY_CRON_RUNTIME_BUDGET_MS`        | Runtime        | 60,000–270,000; below active function limit                  | **CODE READY**                       |
| `ERP_INGEST_KEY`                      | Runtime secret | Canonical tenant API ingestion key                           | **OWNER PENDING**                    |
| `RESEND_API_KEY`                      | Runtime secret | Required for the selected transactional provider             | **OWNER PENDING**                    |

## Stripe pricing contract

Paid checkout requires all six mappings as a coherent set:

- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`

Names and typed validation are `CODE READY`; configured IDs and the exact
product/amount/currency/interval relationship are `OWNER PENDING / BLOCKED`.

## Application browser/build names

Only these `NEXT_PUBLIC_` names may reach the browser; none may contain a
credential:

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION`,
`NEXT_PUBLIC_DEFAULT_TENANT_ID`, `NEXT_PUBLIC_FB_STORAGE`,
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`,
`NEXT_PUBLIC_LIGHTHOUSE_PERFORMANCE_SCORE`, `NEXT_PUBLIC_MARKETING_URL`,
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`,
`NEXT_PUBLIC_SENTRY_RELEASE`,
`NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`,
`NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`,
`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

There is no active Uploadcare environment reference or SDK dependency. The
`ucarecdn.com` image allow-list is read-only compatibility for historical URLs;
inventory and migrate legacy objects before removing it. `NEXT_PUBLIC_FB_STORAGE`
is a legacy alias and should be removed only after usage evidence.

## Application server secrets and credential-bearing names

`AI_BYOK_ENCRYPTION_KEY`, `AI_TOOL_BUS_SECRET`, `ANTHROPIC_API_KEY`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CALENDLY_CLIENT_ID`,
`CALENDLY_CLIENT_SECRET`, `CALENDLY_TOKEN_ENCRYPTION_KEY`,
`DEMO_USER_PASSWORDS_JSON`, `DOCUMENT_VIRUS_SCAN_API_KEY`,
`DOCUSIGN_CLIENT_ID`, `DOCUSIGN_CLIENT_SECRET`,
`DOCUSIGN_TOKEN_ENCRYPTION_KEY`, `DOCUSIGN_WEBHOOK_SECRET`, `ERP_INGEST_KEY`,
`EXCHANGE_RATE_API_KEY`, `FIREBASE_ADMIN_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY`, `INTERNAL_API_KEY_CURRENT`,
`INTERNAL_API_KEY_PREVIOUS`, `INTERNAL_REQUEST_SIGNING_SECRET`,
`INTERNAL_USAGE_LOG_KEY`, `KV_REST_API_TOKEN`, `MAILCHIMP_CLIENT_SECRET`,
`MAILCHIMP_TOKEN_ENCRYPTION_KEY`, `MICROSOFT_OAUTH_CLIENT_SECRET`,
`MICROSOFT_OAUTH_TOKEN_ENCRYPTION_KEY`, `MONITORING_EMAIL_WEBHOOK_URL`,
`MONITORING_IMMEDIATE_ALERT_WEBHOOK_URL`,
`MONITORING_PAGERDUTY_WEBHOOK_URL`, `MONITORING_SLACK_WEBHOOK_URL`,
`QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_TOKEN_ENCRYPTION_KEY`,
`RESEND_API_KEY`, `SENDGRID_API_KEY`, `SENTRY_AUTH_TOKEN`, `SLACK_CLIENT_SECRET`,
`SLACK_SIGNING_SECRET`, `SLACK_TOKEN_ENCRYPTION_KEY`,
`STRIPE_CONNECT_CLIENT_ID`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
`STRIPE_INVOICE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`,
`XERO_CLIENT_SECRET`, and `XERO_TOKEN_ENCRYPTION_KEY`.

Sender addresses/names are not credentials, but remain server-only unless a
specific UI contract requires otherwise.

## Application runtime configuration and feature names

`API_DEPRECATION_NOTIFY_EMAILS`, `APP_URL`, `AWS_REGION`,
`BACKUP_RETENTION_DAYS`, `BACKUP_STORAGE_BUCKET`, `BASE_URL`,
`BIZOSTO_ENVIRONMENT`, `CSP_ENFORCE`,
`DAILY_ABANDONED_SIGNUP_TENANT_BATCH_SIZE`,
`DAILY_BILLING_TENANT_BATCH_SIZE`, `DAILY_CRON_RUNTIME_BUDGET_MS`,
`DAILY_INVOICE_REMINDER_LIMIT`, `DAILY_RETENTION_TENANT_BATCH_SIZE`,
`DAILY_TRIAL_TENANT_BATCH_SIZE`, `DEFAULT_TENANT_ID`,
`DEMO_DATA_MUTATIONS_ENABLED`, `DEMO_FIREBASE_PROJECT_ID`,
`DOCUMENT_VIRUS_SCAN_CLAMAV`, `DOCUMENT_VIRUS_SCAN_ENDPOINT`,
`DOCUSIGN_AUTH_BASE_URL`, `DOCUSIGN_SCOPES`,
`ERP_ENABLE_INVOICE_LATE_FEES`, `ERP_ENABLE_RECURRING_INVOICES`,
`ERP_ORDER_PREFIX`, `EXCHANGE_RATE_API_URL`,
`FIREBASE_EXPECTED_PROJECT_ID`, `FIREBASE_EXPECTED_STORAGE_BUCKET`,
`FIREBASE_PRODUCTION_PROJECT_ID`, `FIREBASE_PRODUCTION_STORAGE_BUCKET`,
`FIREBASE_STORAGE_BUCKET`, `GOOGLE_OAUTH_CLIENT_ID`, `KV_REST_API_URL`,
`LIGHTHOUSE_PERFORMANCE_SCORE`, `MAILCHIMP_CLIENT_ID`,
`MICROSOFT_OAUTH_AUTHORITY_TENANT`, `MICROSOFT_OAUTH_CLIENT_ID`,
`NOTIFICATIONS_EMAIL_PROVIDER`, `ONBOARDING_FROM_EMAIL`, `QA_BASE_URL`,
`QUICKBOOKS_API_BASE_URL`, `QUICKBOOKS_CLIENT_ID`, `SENDGRID_FROM_EMAIL`,
`SENDGRID_FROM_NAME`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_ORG`,
`SENTRY_PROJECT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`,
`SES_FROM_EMAIL`, `SLACK_CLIENT_ID`, all six Stripe price names,
`TWILIO_FROM_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_PHONE_NUMBER`,
`UPSTASH_REDIS_REST_URL`, `XERO_API_BASE_URL`, `XERO_CLIENT_ID`, and
`XERO_ORGANIZATION_ID`.

Optional provider configuration must fail only the affected feature and must
not turn an unavailable external action into a successful status.

## Test, emulator, CI and platform names

`ANALYZE`, `API_TOKEN`, `CI`, `E2E_BASE_URL`, `E2E_DEMO_PASSWORDS_JSON`,
`E2E_EXPECTED_FIREBASE_PROJECT_ID`, `E2E_ISOLATED_ENVIRONMENT`,
`FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`,
`GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GITHUB_OUTPUT`, `LOAD_TEST_API_TOKEN`, `LOAD_TEST_BASE_URL`,
`LOAD_TEST_USER_EMAIL`, `LOAD_TEST_USER_PASSWORD`, `NEXT_PHASE`,
`NEXT_RUNTIME`, `NODE_ENV`, `SONAR_HOST_URL`, `SONAR_TOKEN`, `VERCEL_ENV`,
`VERCEL_GIT_COMMIT_SHA`, and `VERCEL_URL`.

Dynamic role-email access expands to: `E2E_SUPER_ADMIN_EMAIL`,
`E2E_ADMIN_EMAIL`, `E2E_SALES_MANAGER_EMAIL`, `E2E_SALES_EMAIL`,
`E2E_AM_MANAGER_EMAIL`, `E2E_AM_EMAIL`,
`E2E_PRODUCTION_MANAGER_EMAIL`, `E2E_PRODUCTION_EMAIL`,
`E2E_FINANCE_EMAIL`, `E2E_HR_EMAIL`, and `E2E_CLIENT_EMAIL`.

Firebase deployment workflow identity names are repository/environment
credentials. Emulator mutation requires Auth and Firestore emulator hosts; the
Storage emulator host is additionally required for storage writes. A single
emulator variable is not sufficient evidence of isolation.

## Marketing website names

| Name                                      | Exposure      | Requirement                                                                                    |
| ----------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `BIZOSTO_INGEST_ENDPOINT`                 | Server        | Canonical `/api/ingest/leads`; production HTTPS/app origin; preview must not target production |
| `BIZOSTO_INGEST_API_KEY`                  | Server secret | Tenant-scoped ingestion key, minimum length enforced                                           |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`          | Browser       | Required in production                                                                         |
| `RECAPTCHA_SECRET_KEY`                    | Server secret | Required in production                                                                         |
| `RECAPTCHA_ALLOWED_HOSTNAMES`             | Server        | Required allow-list in production                                                              |
| `RECAPTCHA_MINIMUM_SCORE`                 | Server        | Optional, defaults to 0.5, bounded 0–1                                                         |
| `NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID`       | Browser       | Optional; loads only after consent                                                             |
| `NEXT_PUBLIC_SELF_SERVICE_SIGNUP_ENABLED` | Browser       | Public launch switch; keep false until ERP gate                                                |
| `NODE_ENV`, `VERCEL_ENV`                  | Platform      | Runtime classification                                                                         |

The website holds no Firebase Admin credential and the production dependency
audit is clean after Next.js 16.3.2. Its Vercel Node runtime remains
`OWNER PENDING` alignment from 24.x to the source/CI 22.x contract.

## Evidence interpretation

- **CODE READY**: typed/documented and fails safely in source.
- **SANDBOX VERIFIED**: exercised with isolated non-production credentials.
- **OWNER PENDING**: account owner must configure or inspect it.
- **LIVE VERIFIED**: production metadata and behavior independently confirmed.
- **BLOCKED**: a mandatory dependency is absent or unsafe.

No secret-dependent provider is `LIVE VERIFIED` by this release review.
