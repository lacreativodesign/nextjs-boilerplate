# Environment Setup

## Vercel Cron Authentication

- `CRON_SECRET` — a random secret string used to authenticate cron job requests.
- Generate a secure value with: `openssl rand -hex 32`

## Stripe Billing

- `STRIPE_SECRET_KEY` — Stripe secret key for server-side billing operations.
- `STRIPE_INVOICE_WEBHOOK_SECRET` — Stripe webhook signing secret for invoice webhooks.
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` — webhook signing secret for subscription lifecycle events.
- `STRIPE_PRICE_STARTER_MONTHLY` — Stripe price ID for starter monthly plan.
- `STRIPE_PRICE_PRO_MONTHLY` — Stripe price ID for pro monthly plan.
- `STRIPE_PRICE_ENTERPRISE_MONTHLY` — Stripe price ID for enterprise monthly plan.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key for client-side Stripe.js.

- Stripe Tax is enabled via the Stripe Dashboard — no additional environment variables required beyond what is already configured. See docs/stripe-tax-setup.md for setup instructions.
