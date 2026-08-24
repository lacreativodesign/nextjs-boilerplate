# Owner manual checklist

These actions require account ownership, production authority, a paid/live
service or legal approval and were not performed. Never paste secret values in a
PR, issue, chat, log or this document.

## Immediate production safety

- [ ] In Firebase Auth project `la-creativo-erp`, inspect every historical
      `demo_*@bizosto.com` account. Disable/delete unused accounts or rotate each
      independently; do not reuse or disclose a shared value.
- [ ] Inspect tenant `bizosto-demo` and related documents/objects. Prove it
      contains no real customer or production data before cleanup.
- [ ] Keep `DEMO_DATA_MUTATIONS_ENABLED` absent/false in production and preview.
- [ ] Keep public signup disabled until controlled-beta approval.
- [ ] Inventory existing `client` Auth users and custom claims. Backfill
      tenant/client/role bindings only through a reviewed isolated migration,
      then run same-tenant cross-client and cross-tenant negative tests.

## Firebase environment separation

- [ ] Create/approve a separate staging Firebase project without production data.
- [ ] Configure staging Auth, Firestore and Storage; use a staging-only Admin
      service account and browser SDK configuration.
- [ ] Configure expected and production project/bucket boundary names from
      `ENVIRONMENT_MATRIX.md` for every Vercel environment.
- [ ] Confirm production browser/Admin/expected IDs and buckets all resolve only
      to production.
- [ ] Confirm preview browser/Admin/expected IDs and buckets all resolve only to
      staging and differ from production using redacted diagnostics.
- [ ] Restrict service-account permissions; record owner and rotation date.

## Firestore and Storage

- [ ] Complete Firebase Storage billing/capability for the approved projects.
- [ ] Review the exact release `firestore.rules`, `storage.rules`,
      `firestore.indexes.json` and `firebase.json` diff.
- [ ] Configure GitHub-to-Google Workload Identity Federation inputs; do not
      restore legacy `FIREBASE_TOKEN` auth.
- [ ] Run the missing Auth/Firestore/Storage emulator authorization matrix.
- [ ] Deploy first to isolated staging, wait for all 161 indexes to become ready,
      and repeat notifications/activity/presence plus HR/finance/dashboard/audit
      query cases.
- [ ] Manually approve production rules/index deployment only after staging
      evidence, then inspect deployed metadata independently.
- [ ] Inspect Storage CORS, ownership, lifecycle, download-token exposure, quota
      telemetry and tenant prefixes.

## Stripe subscription billing

- [ ] Activate/verify the production account.
- [ ] Create or confirm Starter, Pro and Enterprise monthly/annual recurring
      prices matching the Product Constitution and configure all six names.
- [ ] Configure separate staging/production subscription webhook signing secrets.
- [ ] In test mode verify required-card 14-day trial, day-15 conversion,
      cancellation before charge, payment failure/grace/soft/hard lock, upgrade,
      downgrade-at-period-end, cancellation and duplicate/delayed webhooks.
- [ ] Record non-secret product/price/event identifiers and expected transitions.

## Stripe Connect tenant-client payments

- [ ] Enable/approve Connect capabilities and OAuth settings separately from
      Bizosto SaaS subscription billing.
- [ ] Verify one connected account binds to exactly one tenant.
- [ ] Test simultaneous payment attempts reuse one invoice balance attempt,
      partial payments, 3DS, duplicate/delayed events, the eligible 0.5% fee,
      refund with fee reversal, dispute and reconciliation.
- [ ] Keep public invoice payments disabled until these sandbox cases pass.

## Vercel and GitHub

- [ ] Confirm only `/api/cron/daily-orchestrator` is scheduled at `0 2 * * *`
      after an approved deployment; configure a distinct `CRON_SECRET` per target.
- [ ] Validate the runtime budget against the active function limit and alert on
      failed, incomplete, exhausted or budget-skipped work.
- [ ] Align the website Vercel Node setting from the observed 24.x to source/CI
      Node 22.x and verify deployment metadata.
- [ ] Protect both `main` branches; require PR review and current quality checks;
      block force pushes and branch deletion.
- [ ] Review stale overlapping PRs manually; do not auto-merge or auto-close.
- [ ] Record the prior production deployments and rollback owner.

## Dependency, performance and UI evidence

- [ ] Open dedicated ERP compatibility PRs for Next 14→supported release,
      `@sentry/nextjs`/OpenTelemetry/Rollup and Firebase/Admin/Undici; reach zero
      high production advisories and run the complete suite on Node 22.
- [ ] Profile and reduce common-shell payload until the unchanged 200 KB main and
      100 KB route targets pass.
- [ ] Replace every legacy LA CREATIVO/mixed-currency marketing screenshot with
      accurate images captured from a consented isolated Bizosto tenant.
- [ ] Run all eleven roles, three plans, subscription states and negative resource
      ownership journeys across desktop/mobile, keyboard, screen reader,
      light/dark and visual regression.
- [ ] Choose an owner-approved global marketing abuse-control mechanism using
      already-approved infrastructure; prove limits/retries under bounded load.
- [ ] Decide whether to implement organization-wide session revocation. Do not
      reintroduce a UI toggle until it actually invalidates sessions and is audited.

## Providers, operations and legal

- [ ] Sandbox-certify only the integrations intended for beta; remove or qualify
      unsupported certification claims.
- [ ] Decide whether the existing Upstash service may process bounded daily
      queues; otherwise defer scheduled sync/report promises explicitly.
- [ ] Approve a backup cadence/RPO/RTO that is honest under one daily Hobby cron
      and execute an isolated restore drill.
- [ ] Configure monitoring destinations and named on-call owners; run a staging
      alert and incident drill.
- [ ] Obtain counsel approval for Terms, Privacy, DPA, retention/deletion,
      subprocessors, cookies, Stripe/Connect fee wording and marketing claims.
- [ ] Approve the 3–5 beta tenant list, support channel, incident/refund owners and
      go/no-go meeting.
