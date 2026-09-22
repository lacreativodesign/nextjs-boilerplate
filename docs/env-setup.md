# Environment Setup

## Vercel Cron Authentication

- `CRON_SECRET` — a random secret string used to authenticate cron job requests.
- Generate a secure value with: `openssl rand -hex 32`

## Stripe Billing

- `STRIPE_SECRET_KEY` — Stripe secret key for server-side billing operations.
- `STRIPE_CONNECT_CLIENT_ID` — from Stripe Dashboard → Connect → Settings → Client ID.
- `STRIPE_INVOICE_WEBHOOK_SECRET` — Stripe webhook signing secret for invoice webhooks.
- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for Connect account webhooks.
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` — webhook signing secret for subscription lifecycle events.
- `STRIPE_PRICE_STARTER_MONTHLY` — Stripe price ID for starter monthly plan.
- `STRIPE_PRICE_PRO_MONTHLY` — Stripe price ID for pro monthly plan.
- `STRIPE_PRICE_ENTERPRISE_MONTHLY` — Stripe price ID for enterprise monthly plan.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key for client-side Stripe.js.

- Stripe Tax is enabled via the Stripe Dashboard — no additional environment variables required beyond what is already configured. See docs/stripe-tax-setup.md for setup instructions.

### Stripe Connect setup note

Stripe Connect must be enabled on your Stripe account. Go to Stripe Dashboard → Connect → Settings and ensure Connect is activated. Set the redirect URI to: `[NEXT_PUBLIC_APP_URL]/api/stripe/connect/callback`

## Sentry Error Monitoring

Required:

- `NEXT_PUBLIC_SENTRY_DSN` — Your Sentry project DSN (from sentry.io → Project Settings → Client Keys)

Optional but recommended:

- `SENTRY_ORG` — Your Sentry organization slug (required for source map uploads)
- `SENTRY_PROJECT` — Your Sentry project slug (required for source map uploads)
- `SENTRY_AUTH_TOKEN` — Sentry auth token for CI/CD source map uploads
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT` — Environment name shown in Sentry (e.g. "production", "staging")
- `NEXT_PUBLIC_SENTRY_RELEASE` — Release version string for tracking deploys
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` — Performance monitoring sample rate 0.0-1.0 (default 0.1)
- `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` — Session replay rate (default 0)
- `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` — Replay rate on errors (default 1.0)

Setup steps:

1. Create account at sentry.io
2. Create new project → select Next.js
3. Copy DSN and add to Vercel environment variables
4. Add SENTRY_ORG and SENTRY_PROJECT for source map uploads
5. Redeploy on Vercel
6. Verify at /super_admin/monitoring

## Firebase Environment Isolation (Vercel Preview only)

Production and Preview must never share a Firebase project, database or Storage bucket.
Production needs no variables here — its identity is pinned in
`lib/firebase/environment.mjs` — but a Vercel **Preview** deployment must declare the
isolated staging environment it belongs to, or it fails closed at boot:

- `STAGING_FIREBASE_PROJECT_ID` — the staging Firebase project a Preview must use. Must
  not be `la-creativo-erp`, and must equal `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and the
  `project_id` of the Preview's `FIREBASE_ADMIN_KEY`.
- `STAGING_FIREBASE_STORAGE_BUCKET` — that project's Storage bucket. Must not be
  `la-creativo-erp.firebasestorage.app`, and must equal
  `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

Both are public identifiers rather than secrets, and both are scoped to the **Vercel
Preview** environment — they configure the deployed app, and no GitHub job reads them.

The matching staging service account used by the golden tenant gate,
`FIREBASE_ADMIN_KEY_STAGING`, is a different store again: it lives in the GitHub
**`firebase-staging` Environment**, restricted to the `main` branch, together with
`E2E_DEMO_PASSWORD` and `VERCEL_AUTOMATION_BYPASS_SECRET`. It is deliberately **not** a
repository-level Actions secret — a repository secret is readable by workflow code running
on any ref a dispatcher selects, which is the finding P0-02 exists to close. Production's
`FIREBASE_ADMIN_KEY` sits the same way in `firebase-production`.

Full setup, including what has to be created in Firebase, Vercel and GitHub, is in
`docs/runbooks/firebase-environment-isolation.md`.
