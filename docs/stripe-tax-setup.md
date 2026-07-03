# Stripe Tax Setup (Bizosto)

## Section 1 — Enable Stripe Tax

1. Log into Stripe Dashboard at `https://dashboard.stripe.com`.
2. Navigate to **More → Tax**.
3. Click **Get started with Stripe Tax**.
4. Enter your business address as:
   - **Business Name:** LA CREATIVO GROUP, LLC
   - **State:** Texas
   - **Country:** United States
5. Enable automatic tax calculation.

## Section 2 — Register Tax Obligations

1. In **Stripe Tax → Registrations**, click **Add registration**.
2. Add **United States → Texas** (home state; always required).
3. As revenue grows and you reach **$100,000 revenue** or **200 transactions** in other US states, add those states.
4. For international expansion, add countries as needed (commonly UK VAT, EU VAT, Canada GST/HST, Australia GST, UAE VAT).

## Section 3 — Configure Products

1. In **Stripe Dashboard → Products**, open each Bizosto plan product: Starter, Pro, Enterprise.
2. Set **Tax code** for each product to: `txcd_10103001` (**SaaS - Business**).
3. Set **Tax behavior** on each associated Stripe Price to: **Exclusive** (tax added on top of listed plan price).

## Section 4 — Add Webhook Endpoint

1. In **Stripe Dashboard → Developers → Webhooks**.
2. Add endpoint: `[YOUR_VERCEL_URL]/api/stripe/subscription-webhook`.
3. Select these events:
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `invoice.finalized`
   - `customer.tax_id.created`
4. Copy the webhook signing secret and set it in Vercel as `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`.

## Section 5 — Test Tax Calculation

1. Switch Stripe to **test mode**.
2. Create a test subscription using a US billing address.
3. Verify tax appears on the test invoice.
4. Use Stripe Tax calculator tools to validate expected jurisdiction rates.
