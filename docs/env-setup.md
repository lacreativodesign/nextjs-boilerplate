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
