# Independent Claude Code audit-and-remediation prompt

Use the following prompt in Claude Code after the draft PR exists. Replace no
facts silently; independently resolve and record the branch HEAD before acting.

---

Act as an independent principal SaaS/security/release reviewer for Bizosto.
Audit the actual GitHub branches and their full diffs; do not trust the author
summary or old ZIPs.

Repositories and immutable bases:

- ERP: `lacreativodesign/nextjs-boilerplate`
  - base: `f0d3ce4ba16c28bcb114fe01fa7054e6e3397d15`
  - release branch: `codex/release-readiness-2026-08-22`
  - release integration commit: `REMEDIATION_COMMIT_TO_BE_FILLED`
- Marketing: `lacreativodesign/bizosto-website`
  - base: `3608335e8a5ece2aef1befcae1e823a4e1187db1`
  - release branch: `codex/launch-alignment-2026-08-22`
  - release commit: `10c9b9026650765638f7ab70104eeb15fcc8f546`

At the start, fetch both branches, record their actual HEAD SHAs and compare
`base...HEAD`. If a SHA above differs from GitHub, stop and explain the exact
drift. Do not merge, deploy, change secrets/settings/rules/indexes, or write any
production/preview Firebase or Stripe data.

Hard owner constraint: `vercel.json` must contain exactly one schedule,
`/api/cron/daily-orchestrator` at one daily execution. Do not add an external
scheduler, queue, paid Firebase service or plan upgrade. Immediate OTP, signup,
payment confirmation and activation must remain request/webhook-driven.

Safety fact to re-verify first: production and preview were both observed using
Firebase project `la-creativo-erp`. Until client SDK, Admin SDK and Storage are
proven isolated, run no deployed write-capable browser flow. Use only pure/
mocked tests or a confirmed emulator/isolated project.

Independently review every changed file and focus on:

1. Middleware prefetch removal and exact `pending_checkout` recovery paths.
2. Firebase project/bucket contract, signup/OTP flags, reserved tenants, demo
   and E2E fail-closed behavior.
3. Daily job registry, auth, leases, retry/idempotency, bounded cursors, budget,
   failure isolation and truthful blocked/incomplete outcomes.
4. Firestore/Storage rules and all 161 index definitions, especially the five
   runtime notification/activity/presence shapes. File existence is not live
   deployment evidence.
5. DocuSign envelope binding; Stripe versus Connect separation; connected
   account→tenant→invoice binding; amount/currency/client/0.5% fee; stable public
   PaymentIntent reuse; refund/ledger idempotency.
6. Managed-file ACLs, object tenant prefix, signed URL lifetime, chunks, quota,
   versions/share/restore/delete and existing download-token exposure.
7. Client tenant/client/role claims, Starter 10 portal seats, legacy identity
   migration, closed-won discount/currency/idempotent activation.
8. Workflow/AI action binding, removal of the root-secret HTTP bus and whether
   every unsupported dangerous action is actually unavailable and truthful.
9. Website lead relay: exact origin, schema/body, tenant API key, idempotency,
   CAPTCHA hostname/score, non-production→production block, consent and claims.
10. UI changes and remaining deceptive/dead actions, all 11 roles, three plans,
    responsive/a11y/theme states and legacy marketing screenshots.

Re-run on Node 22 where possible: clean install, generated-doc drift, Prettier,
lint, TypeScript, all Jest tests with coverage, Asia/Karachi timezone tests,
production builds, bundle/license gates and production dependency audits. Run
Firebase Rules Emulator and Playwright only after proving isolation. Record
actual exit codes/counts and never convert a failed or unavailable check into a
pass.

Known claims to challenge, not accept:

- ERP author run: 191 suites / 2,039 tests and 516-page build passed; lint exited
  0 with 2,597 warning lines; license policy passed 1,097 packages.
- ERP bundle gate failed (205.14 KB shared main; common shell routes about 378
  KB), and production audit reported 38 moderate + 5 high advisories.
- Website author run: lint/typecheck, 9 tests and 37-route Next 16.3.2 build
  passed; production audit reported zero advisories.
- No actual Firebase Rules Emulator, isolated Playwright, Stripe/Connect,
  DocuSign, email/SSO/accounting sandbox or production deployment verification
  was completed.

Implement only independently reproducible, safe source fixes on a new branch
from the ERP release HEAD (and a separate website branch if needed). Never hide
an unfinished promised feature, weaken authorization, change locked pricing or
represent an external dependency as verified. Return: reviewed-file coverage,
P0–P3 deltas, exact changes/commits/tests, tenant-isolation counterexamples,
remaining owner checklist, rollback notes and draft PR links. Do not merge.

---
