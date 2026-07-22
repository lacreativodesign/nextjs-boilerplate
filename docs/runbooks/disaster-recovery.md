# Disaster Recovery Runbook

Operational procedures for backing up and restoring Bizosto tenant data. This runbook is kept in sync with the code by `__tests__/docs/dr-runbook.test.ts` — if an endpoint or path below changes, that test fails until the runbook is updated.

## Scope and objectives

- **What is protected:** the canonical top-level Firestore collections that hold tenant business data — `users`, `clients`, `invoices`, `projects`, `products`, `payments`, `documents` — backed up per tenant.
- **What is not covered here:** Firebase Auth users, Storage file blobs, and Stripe state. Auth and billing state are reconstructable from their sources of truth; file blobs live in Cloud Storage and are not exported by this job.
- **RPO (recovery point objective):** up to 24 hours — backups run nightly.
- **RTO (recovery time objective):** restore into isolated collections completes in minutes; promoting verified data back to live is a deliberate manual step.

## Backup system

- **Endpoint / job:** `/api/cron/backup`, run by Vercel Cron on schedule `0 2 * * *` (02:00 UTC daily).
- **Authentication:** `Authorization: Bearer <CRON_SECRET>` (or the `x-vercel-cron` header Vercel sends). Manual invocation requires the Bearer token.
- **Bucket:** resolved by `getBackupBucketName()` — `FIREBASE_STORAGE_BUCKET` then `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` then SDK default. Set `FIREBASE_STORAGE_BUCKET` explicitly in production so this is never ambiguous.
- **Layout:** one JSON file per tenant per collection at `backups/<runDate>/<tenantId>/<collection>.json`, plus a single `backups/<runDate>/manifest.json`.
- **Integrity:** the manifest lists every file with its record count and a **sha256** checksum of the exact bytes written. Restore refuses to apply anything whose bytes do not match.
- **Durability:** any failure writes to the `dead_letter_backups` collection and emails an alert to the admin address. A summary record is also written to the `backups` collection.

### Verify a backup is healthy

1. Confirm the nightly run left `backups/<today>/manifest.json` in the bucket.
2. Confirm `dead_letter_backups` has **no** new entries for that run date.
3. Spot-check `manifest.json`: `totalRecords > 0` and every entry has a `sha256`.

If the manifest is missing or `dead_letter_backups` has an entry, treat the nightly backup as failed and investigate before relying on it.

## Restore procedure

Restore is a **super_admin-only**, two-phase operation. It never overwrites live data — verified documents are written into isolated `restore_<runDate>__<collection>` collections. Promoting them back to live is a separate, deliberate step.

### Phase 1 — dry run (no writes)

Send `GET /api/super_admin/restore?manifestPath=backups/<runDate>/manifest.json`, optionally narrowed with `&collection=<name>` and/or `&tenantId=<id>`. The dry run re-reads each file, recomputes its sha256, and reports which files **would** restore cleanly versus which are mismatched. It writes nothing. Do not proceed if any file is reported as mismatched.

### Phase 2 — apply (isolated restore)

Send `POST /api/super_admin/restore` with a JSON body of `{ "manifestPath": "backups/<runDate>/manifest.json", "collection": "<optional>", "tenantId": "<optional>" }`. Behaviour:

- Any checksum mismatch **aborts the entire run** (recorded to `restore_audit` with status `aborted`) so a half-applied restore can never be left behind.
- Verified documents are written into `restore_<runDate>__<collection>` — the live collections are untouched.
- Every apply and every abort is recorded to `restore_audit`.

### Phase 3 — promote to live (manual, deliberate)

Restore intentionally stops at the isolated collections so a human can inspect the recovered data before it goes live. To promote:

1. Inspect `restore_<runDate>__<collection>` in the Firestore console.
2. For the affected tenant, copy the verified documents into the live collection, preserving document IDs.
3. Record who promoted what, and when, in the diligence room.

## Witnessed restore drill (quarterly / pre-diligence)

Run against the **demo tenant** so live tenants are never touched. Store the output in the diligence room as evidence of a working recovery path.

1. Trigger a backup (or use the latest nightly): confirm `backups/<runDate>/manifest.json` exists.
2. As super_admin, run the **dry run** for that manifest scoped to the demo tenant (`&tenantId=<demo>`). Capture the response showing 0 mismatches.
3. Run the **apply** (POST) scoped to the demo tenant. Capture the response and the new `restore_<runDate>__*` collections.
4. Verify a `restore_audit` entry with status `applied` (not `aborted`).
5. Spot-check a few restored documents against the live demo data.
6. Save the dry-run response, apply response, and `restore_audit` entry, with the date and the operator's name, to the diligence room.

## Incident scenarios

- **Accidental deletion of a tenant's records:** dry-run the most recent good manifest for that tenant, apply scoped to `tenantId`, inspect the isolated collection, then promote.
- **Suspected corruption:** the sha256 gate rejects corrupted files automatically; a mismatch aborts the run. Fall back to an earlier `runDate` whose dry run is clean.
- **Bucket misconfiguration / empty backups:** confirm `FIREBASE_STORAGE_BUCKET` matches the real bucket, then re-run `/api/cron/backup` with the Bearer token.

## Roles and escalation

- **Backups:** automated (Vercel Cron). Monitored via `dead_letter_backups` + email.
- **Restore / promotion:** super_admin only.
- **Escalation:** a failed nightly backup or an aborted restore is a P1 — investigate before the next nightly window so the RPO does not silently widen.
