# Firebase Security Rules Deployment

How `firestore.rules` and `storage.rules` reach the production project
`la-creativo-erp`, and the Google Cloud and GitHub configuration the pipeline
expects. The workflow is `.github/workflows/deploy-rules.yml`; its contract is
pinned by `__tests__/ci/firebase-rules-deploy-workflow.test.ts`.

## Why this exists

Every run of `Deploy Security Rules` failed with:

```
Error: Failed to authenticate, have you run firebase login?
```

The step ran `firebase deploy --token "${{ secrets.FIREBASE_TOKEN }}"`, and that
secret is not configured. GitHub renders an unset secret as an empty string, and
firebase-tools treats an empty `--token` as no token at all: it skips the token
path, finds no signed-in user (nothing runs `firebase login` on a runner), falls
through to Application Default Credentials, finds none, and reports the message
above. The workflow was not using a stale credential — it was authenticating with
nothing.

PR #1005 is what made this expensive. It tightened the paid browser upload
prefixes in `storage.rules` to CREATE-only, the rules guards passed, the merge
went in, and the deploy failed — so the bucket kept serving the previous ruleset.
**Until a deployment succeeds, the repository's rules are not the live rules.**

## The model

Keyless Workload Identity Federation, the same provider architecture already
certified for Firestore indexes. GitHub mints a short-lived OIDC token for the
job; Google exchanges it for an access token impersonating a dedicated service
account; the Firebase CLI reads the resulting Application Default Credentials.
Nothing long-lived is stored anywhere.

The trust boundary is:

| Layer                      | Restriction                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Workload Identity provider | The existing provider, unchanged                                                                   |
| IAM principal binding      | `repository = lacreativodesign/nextjs-boilerplate`, `ref = refs/heads/main`                        |
| Workflow guard             | Fails closed unless `github.ref` is exactly `refs/heads/main`, in both jobs, before authentication |
| GitHub environment         | `firebase-rules-production`, required reviewer, branch-restricted to `main`                        |
| Google IAM                 | Rules publication only — no index write, no document data, no bucket objects                       |
| Deploy scope               | `--only firestore:rules,storage:rules`, nothing else                                               |

Four of those six live outside this repository entirely — the provider, the IAM
binding, the Google IAM role, and the environment's protections. So the IAM
binding, the required reviewer and the branch restriction all still hold even if
this workflow file is edited. Only the ref guard and the deploy scope are in the
repository, and both are pinned by the workflow contract test.

## Minimum Google IAM

These were determined by reading firebase-tools 13.35.1 — the pinned version — and
tracing every API call `firebase deploy --only firestore:rules,storage:rules`
makes, rather than by starting from a predefined role and working backwards.

| Permission                          | Why the deploy needs it                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firebaserules.rulesets.test`       | `compileRuleset` posts each ruleset to `projects/{p}:test` to surface compilation errors before publishing                                                                                                              |
| `firebaserules.releases.get`        | `getLatestRulesetName` resolves the current release                                                                                                                                                                     |
| `firebaserules.releases.list`       | Same call, listing releases to find the one for this service                                                                                                                                                            |
| `firebaserules.rulesets.get`        | `getRulesetContent` reads the live ruleset so an unchanged file is not re-uploaded                                                                                                                                      |
| `firebaserules.rulesets.create`     | Uploads the new ruleset. This is the publish                                                                                                                                                                            |
| `firebaserules.releases.update`     | Points the `cloud.firestore` and `firebase.storage/{bucket}` releases at the new ruleset                                                                                                                                |
| `firebaserules.releases.create`     | The create half of `updateOrCreateRelease`, used when a release does not yet exist                                                                                                                                      |
| `firebaserules.rulesets.list`       | Only reached on a quota-exceeded response, to report how many rulesets exist                                                                                                                                            |
| `firebasestorage.defaultBucket.get` | `getDefaultBucket` reads `projects/{p}/defaultBucket` to learn which bucket the storage release names. `firebase.json` declares `storage.rules` without an explicit bucket, so the CLI asks Google rather than assuming |
| `serviceusage.services.get`         | The same code path first checks that `firebasestorage.googleapis.com` is enabled. A read, and the only Service Usage call made                                                                                          |

Grant them as one custom role on the project — this repository already uses a
custom role for the Firestore index reader, for the same reason: a predefined role
is a bundle, and the bundle is bigger than the job.

```bash
gcloud iam roles create bizostoFirebaseRulesDeployer \
  --project=la-creativo-erp \
  --title="Bizosto Firebase Rules Deployer" \
  --description="Publish Firestore and Cloud Storage Security Rules from CI. No index, data or object access." \
  --stage=GA \
  --permissions=firebaserules.rulesets.test,firebaserules.rulesets.get,firebaserules.rulesets.list,firebaserules.rulesets.create,firebaserules.releases.get,firebaserules.releases.list,firebaserules.releases.create,firebaserules.releases.update,firebasestorage.defaultBucket.get,serviceusage.services.get
```

If custom roles are unavailable, the narrowest predefined equivalent is
`roles/firebaserules.admin` + `roles/firebasestorage.viewer` +
`roles/serviceusage.serviceUsageViewer`. That is wider than the table above —
`roles/firebaserules.admin` adds `rulesets.delete`, `releases.delete` and
`releases.getExecutable` — so prefer the custom role.

### What is deliberately not granted

- **`datastore.indexes.create` / `.update` / `.delete`.** The CLI maps
  `--only firestore:rules` to its `firestore` target, and that target's
  _informational_ client-side permission probe asks for all four
  `datastore.indexes.*` permissions. The runtime path touches no index API at all:
  with `--only firestore:rules`, firebase-tools sets its own `firestoreIndexes`
  flag to `false` and its `deployIndexes` step returns immediately. The probe is
  therefore skipped, with `FIREBASE_SKIP_INFORMATIONAL_IAM`, rather than satisfied.
  Satisfying it would hand a rules deployer the index write authority that
  `deploy-indexes.yml` deliberately keeps behind a separate identity and a separate
  approval. The probe is not a security control — it is a `testIamPermissions`
  call whose own error handler swallows failures and continues — and Google Cloud
  IAM still enforces every API call server-side either way. **Skipping it lowers
  this identity's privilege; it does not raise it.**
- **`firebaserules.rulesets.delete`.** Only reached when the project passes 1000
  rulesets, to garbage-collect the oldest. Left out so that case fails loudly and
  an owner prunes deliberately, rather than CI deleting ruleset history on its own.
- **`serviceusage.services.enable`.** The Storage API is already enabled. If it
  ever is not, that should stop a production publish, not be fixed silently by it.
- **`roles/owner`, `roles/editor`, `roles/firebase.admin`, `roles/datastore.owner`,
  `roles/storage.admin`, `roles/firebasestorage.admin`.** Each would work. Each also
  grants read or write access to document data, bucket objects, or both — none of
  which publishing a ruleset requires.

## Owner setup

Do all of this **before** the pull request is merged. The workflow fails closed
until it is complete, so an incomplete setup cannot half-publish anything.

Run the `gcloud` commands as a project owner, with
`gcloud config set project la-creativo-erp` already applied.

### 1. Create the service account

```bash
gcloud iam service-accounts create firebase-rules-deployer \
  --project=la-creativo-erp \
  --display-name="Firebase Rules Deployer (GitHub Actions)" \
  --description="Publishes Firestore and Storage Security Rules from CI via Workload Identity Federation. Keyless."
```

Resulting email — this is the value the workflow expects:

```
firebase-rules-deployer@la-creativo-erp.iam.gserviceaccount.com
```

**Never create or download a JSON key for this account.** A key is a long-lived
credential and is exactly what federation removes the need for. If one is ever
created by accident, delete it and rotate.

### 2. Grant the role

Create the custom role above, then bind it:

```bash
gcloud projects add-iam-policy-binding la-creativo-erp \
  --member="serviceAccount:firebase-rules-deployer@la-creativo-erp.iam.gserviceaccount.com" \
  --role="projects/la-creativo-erp/roles/bizostoFirebaseRulesDeployer"
```

### 3. Let GitHub impersonate it, scoped to this repository

Reuse the **existing** Workload Identity provider — the one already in the
`GCP_WORKLOAD_IDENTITY_PROVIDER` repository variable. Do not create a second one.

```bash
# The provider's full resource name, as already stored in GCP_WORKLOAD_IDENTITY_PROVIDER:
#   projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
# The pool resource name is that string up to and including the pool id.
POOL="projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL_ID>"

gcloud iam service-accounts add-iam-policy-binding \
  firebase-rules-deployer@la-creativo-erp.iam.gserviceaccount.com \
  --project=la-creativo-erp \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL}/attribute.repository/lacreativodesign/nextjs-boilerplate"
```

That binds impersonation to this repository. To also bind it to the branch —
strongly preferred, because it makes `refs/heads/main` a Google-side condition
rather than only a workflow-side one — check what the existing provider maps:

```bash
gcloud iam workload-identity-pools providers describe <PROVIDER_ID> \
  --project=la-creativo-erp --location=global --workload-identity-pool=<POOL_ID> \
  --format="yaml(attributeMapping, attributeCondition)"
```

If the mapping includes `attribute.ref`, use the narrower member instead:

```bash
  --member="principalSet://iam.googleapis.com/${POOL}/attribute.ref/refs/heads/main"
```

Note that `attribute.repository` and `attribute.ref` are separate principal sets:
a binding on `attribute.ref` alone trusts `refs/heads/main` of _any_ repository
admitted by the provider. Use it only if the provider's `attributeCondition`
already restricts the repository (check the `describe` output above); otherwise
keep the `attribute.repository` binding, and rely on the workflow's ref guard plus
the environment's branch restriction — which is where the ref is enforced today.

Adding `attribute.ref` to a provider that lacks it changes a provider other
workflows depend on. Treat that as its own change, not part of this setup.

### 4. Add the GitHub repository variable

Repository → Settings → Secrets and variables → Actions → **Variables** →
New repository variable.

| Name                             | Value                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| `GCP_FIREBASE_RULES_DEPLOYER_SA` | `firebase-rules-deployer@la-creativo-erp.iam.gserviceaccount.com` |

A **variable**, not a secret. A service-account email is not a credential — it is
identity configuration — and keeping it in `vars` means the workflow can check it
is non-empty and print it in a failure message without redaction.

`GCP_WORKLOAD_IDENTITY_PROVIDER` is already set and is reused unchanged.

### 5. Configure the environment

Repository → Settings → Environments → **New environment** →
`firebase-rules-production`.

- **Required reviewers:** Mansoor Ahmed (or the `lacreativodesign` owners). Rules
  take effect the instant they are published and there is no staged rollout, so a
  human confirms every publish.
- **Deployment branches and tags:** _Selected branches_ → `main`. This is the
  restriction that survives an edit to the workflow file.
- Do **not** add environment secrets. The job needs none.

## First production deployment

In order, and not before:

1. Steps 1–5 above are complete.
2. Mansoor merges the pull request. The merge commit touches
   `.github/workflows/deploy-rules.yml`, which is in the workflow's push paths, so
   the pipeline triggers on its own — no no-op edit to a production ruleset needed.
3. The `preflight` job runs the ref, project and configuration checks and both
   rules guards. It holds no Google credential.
4. The `deploy` job waits on the `firebase-rules-production` environment.
5. Mansoor approves.
6. The job re-proves the ref, re-runs both guards, authenticates, and publishes.
7. Read the job summary: it names the project, ref, commit, pinned CLI version,
   deployed targets, and includes the CLI output.

Verify independently — the workflow reporting success is the CLI reporting success:

```bash
# The releases currently serving, read through the same API the CLI publishes to.
# `cloud.firestore` and `firebase.storage/<bucket>` each name their live ruleset.
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://firebaserules.googleapis.com/v1/projects/la-creativo-erp/releases"
```

Or in the Firebase console, Firestore → Rules and Storage → Rules, and confirm the
published ruleset matches the repository at the merge commit. For Storage,
specifically confirm the paid browser upload prefixes from PR #1005 are CREATE-only
in the live ruleset — that is the change this pipeline failed to deliver.

## Recovery and rollback

- **Rollback:** revert the rules commit on `main`. The revert is a change to
  `firestore.rules`/`storage.rules`, so the pipeline runs again and republishes the
  previous ruleset through the same reviewed path. Rules are content-addressed and
  the previous rulesets are retained, so the Firebase console's rules history can
  also roll back immediately — do that first if a bad ruleset is live, then land
  the revert so the repository and the project agree.
- **Manual recovery:** `workflow_dispatch` from `main`. The same ref guard,
  environment approval and guards apply; a dispatch from any other branch fails in
  preflight before a credential is minted.
- **Credential revocation:** remove the `roles/iam.workloadIdentityUser` binding in
  step 3. There is no key to rotate and no token to expire — impersonation stops on
  the next run.
- **Loss of the pipeline:** the guards and this runbook are the recovery path.
  Publishing by hand from a workstation bypasses both rules guards and the reviewer,
  so it is a break-glass action, not a workaround.

## What this pipeline does not do

It deploys `firestore:rules` and `storage:rules` and nothing else. Firestore
indexes are `deploy-indexes.yml`, which is a separate identity, a separate
environment and a separate approval, because `firebase deploy` reconciles indexes
in both directions and would propose removing most of the live index set. Hosting
is declared in `firebase.json` but is not deployed by any workflow; the application
is served by Vercel.
