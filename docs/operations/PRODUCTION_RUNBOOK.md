# Bizosto production runbook

This runbook does not authorize a production change. Follow it only with an
approved release, named incident/release owner, and the account permissions
required for the specific step.

## Release roles

- Release owner: approves go/no-go and Vercel promotion/deployment.
- Security owner: verifies Firebase boundary, rules, indexes, Auth accounts, and
  secrets/identity metadata.
- Billing owner: verifies Stripe subscriptions and Connect separately.
- Operations owner: monitors application, cron, email, backup, and support.
- Rollback owner: restores the prior deployment/config source and communicates
  tenant impact.

## Preflight

1. Pin application and website commits and archive the draft PR diffs.
2. Confirm required CI checks pass on the configured Node version.
3. Confirm preview uses isolated Firebase for browser and Admin SDK.
4. Confirm no production-capable demo/seed/reset/migration test will run.
5. Verify all required environment-variable names and safe diagnostics; never
   print values.
6. Verify exactly one daily cron entry.
7. Inspect staging rules/index readiness and affected queries.
8. Verify Stripe test-mode subscription and Connect evidence when the release
   touches billing.
9. Record the prior production Vercel deployment ID and current Firebase
   rules/index source commits.
10. Review open blockers and approve only a controlled-beta containment that
    does not waive a P0.

## Deployment sequence

1. Merge only after owner approval and protected checks; this release agent does
   not merge.
2. Deploy application source without running signup/seed/reset/migration flows.
3. Inspect build/runtime metadata and health endpoints.
4. If required, separately approve Firebase rules/index deployment from the same
   pinned source. Wait for index readiness.
5. Perform read-only smoke checks first: public pages, login page, health status,
   and safe configuration diagnostics.
6. Run approved isolated or synthetic actions only. Never use a real tenant for
   release smoke data.
7. Release the marketing site only after its lead relay target is the approved
   application environment.

## Daily orchestrator operations

- Schedule: `/api/cron/daily-orchestrator`, once daily at `0 2 * * *` UTC.
- Authentication: `Authorization: Bearer <CRON_SECRET>`; Vercel cron metadata
  headers are not credentials.
- Evidence collections: `cron_orchestration_runs`, `cron_job_leases`, and
  `cron_job_executions`.
- Treat `failed`, `incomplete`, `budget_skipped`, `attempts_exhausted`, or lost
  log/lease finalization as operational incidents.
- A `blocked` backup-coordination result is honest owner-decision evidence, not a
  successful backup.
- Immediate OTP, signup confirmation, payment confirmation, and activation use
  requests/webhooks and must not depend on this schedule.

## Incident triage

1. Establish severity and stop further risky changes.
2. Identify environment, deployment ID, commit, route, request/event ID, tenant
   pseudonymous ID, first/last occurrence, and scope. Do not paste secrets or PII.
3. For Firebase permission/index errors, distinguish rules denial, missing index,
   wrong project, Admin initialization, and data-shape error.
4. For Stripe, distinguish platform subscriptions from Connect direct charges;
   inspect signature/account/event claim/resource binding before replay.
5. For email, inspect outbox state and safe error class. Do not resend blindly if
   provider delivery status is unknown.
6. For cron, inspect run → job execution → lease. Retry only jobs explicitly
   marked retry-safe and only after root cause is understood.
7. For suspected cross-tenant access or secret compromise, revoke/rotate through
   the provider, preserve audit evidence, and engage legal/incident owners.

## Rollback

Vercel application/website rollback is a deployment promotion to the recorded
prior deployment, performed by the owner. Source rollback uses a reviewed revert
commit; never reset or force-push `main`.

Firebase rules may be redeployed from the prior pinned rules file when an
approved rule change causes denial/exposure. Composite index additions are
normally forward-compatible; do not delete an index during an incident unless
query usage and rollback impact are proven. Data migrations require their own
forward/rollback plan and an isolated rehearsal; this release contains no live
data migration.

Stripe product/price/webhook changes are not rolled back by source deployment.
The billing owner must preserve existing price IDs and subscriptions, disable
only the faulty entry point if necessary, and reconcile every affected event.

## Backup and restore

The current one-cron Hobby runtime cannot honestly guarantee a full daily
multi-tenant export. The orchestrator records an owner-decision coordination
item. Until approved infrastructure or a manual cadence exists, backup RPO/RTO
is blocked. Never run restore against production during validation. A restore
drill uses an isolated project, verifies manifest hashes/tenant selection,
records `restore_audit`, and confirms representative auth/resource/report data.

## Post-release

- Observe errors, latency, cron status, email dead letters, payment/webhook dead
  letters, and support signals for the owner-approved window.
- Confirm rules/index deployment state and no project mismatch diagnostics.
- Record release evidence, owner actions, incidents, and rollback decision.
- Do not label the release public-launch-ready until every mandatory external
  gate is `LIVE VERIFIED`.
