# Verification evidence

Evidence date: 2026-08-24. Only commands that actually ran are marked passed.
Production and preview write-capable tests were prohibited because both expose
the same Firebase project.

## Read-only baseline evidence

| Check                                      | Result           | Evidence                                                                 |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------------------ |
| Application main                           | PASS             | `f0d3ce4ba16c28bcb114fe01fa7054e6e3397d15`                               |
| Website main                               | PASS             | `3608335e8a5ece2aef1befcae1e823a4e1187db1`                               |
| App Vercel project                         | PASS             | `prj_CHcNsgVwk8HnOXvRsETsCMEqomzF`, Node 22.x                            |
| Website Vercel project                     | MISMATCH         | `prj_HLD6aotNiW3ggkf2O397mUHo8gTF`, Node 24.x versus source/CI 22.x      |
| Production/preview Firebase client project | FAIL SAFETY GATE | Both observed as `la-creativo-erp`; production Admin also resolves there |
| Branch protection                          | FAIL             | Both `main` branches observed unprotected                                |
| Open PR inventory                          | PASS             | ERP 25 and website 2 reviewed as comparison inputs; none changed         |
| Runtime index errors                       | FAIL LIVE        | Five exact composite shapes captured; live deployment unknown            |

## Application release-candidate commands

The workspace runtime was Node 24.19.0/npm 11.9.0 and emitted an expected engine
warning because the project contract is Node 22.x/npm 10+. Vercel and workflow
targets are Node 22, but CI on the draft PR is still required as target-runtime
evidence.

| Command / suite                                | Result             | Actual evidence                                                                        |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS               | 1,325 packages installed from lock; engine warning recorded                            |
| `prettier --check .`                           | PASS               | Release tree formatting check exits 0                                                  |
| `tsc --noEmit`                                 | PASS               | Exit 0 after final source edits                                                        |
| `next lint`                                    | PASS WITH DEBT     | Exit 0; 2,597 warning lines, chiefly `any`, console, type-import and hook debt         |
| Full Jest with coverage                        | PASS               | 191/191 suites and 2,039/2,039 tests; 0 failures/skips                                 |
| Full Jest with `TZ=Asia/Karachi`               | PASS               | 191/191 suites and 2,039/2,039 tests; 0 failures/skips                                 |
| Coverage thresholds                            | PASS               | Global branches 15%, functions 16%, lines/statements 17.5%; `lib/subscription.ts` ≥90% |
| OpenAPI/collection generation and drift tests  | PASS               | 657 endpoints; 198 collections; documentation tests pass                               |
| Cron configuration assertion                   | PASS               | Exactly one entry: `/api/cron/daily-orchestrator`, `0 2 * * *`                         |
| Firebase/index JSON validation                 | PASS               | JSON parses; 161 composite definitions; duplicate/required-shape suites pass           |
| `next build`                                   | PASS               | Exit 0 with 4 GB heap; TypeScript/lint validation and 516-page generation complete     |
| `check-licenses.mjs`                           | PASS               | 1,097 installed package manifests pass reviewed license policy                         |
| `check-bundle-size.mjs`                        | **FAIL / BLOCKED** | Shared main 205.14 KB >200 KB; common shell routes approximately 378 KB >100 KB        |
| `npm audit --omit=dev`                         | **FAIL / BLOCKED** | 43 production advisories: 38 moderate, 5 high, 0 critical                              |
| `git diff --check`                             | PASS               | No whitespace-error diff                                                               |

The PDF renderer was moved behind a user-triggered dynamic import; the finance
report route no longer appears among the five largest initial route offenders.
This is an improvement, not a claim that the overall performance gate passed.

## Marketing website release-candidate commands

| Command / suite              | Result | Actual evidence                                                                           |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| ESLint `--max-warnings=0`    | PASS   | Exit 0                                                                                    |
| `tsc --noEmit`               | PASS   | Exit 0                                                                                    |
| Node contract tests          | PASS   | 9/9 tests; 0 failures/skips                                                               |
| `next build` on 16.3.2       | PASS   | 37 routes generated; exit 0                                                               |
| `npm audit --omit=dev`       | PASS   | 0 advisories                                                                              |
| HTTP/claim source smoke      | PASS   | 8 public routes returned 200 in the isolated local check; 11 beta CTAs and no signup URLs |
| Negative lead endpoint cases | PASS   | Unsupported media/origin/schema cases returned 415/403/400 in local verification          |

The combined `npm run check` wrapper encountered a workspace tooling/network
interruption; every underlying lint, type, test and build command was rerun
directly and passed. No claim relies on the interrupted wrapper.

## Source-level security evidence

- Firebase environment, browser-emulator, signup/demo, daily cron, webhook
  tenant binding, Connect invoice, refund idempotency, managed-file ACL, workflow
  mutation, client identity, closed-won lifecycle, seat-limit, build workflow and
  required-index suites all pass within the 2,039-test run.
- Firestore rules guards and Storage source tests pass, but an actual Firebase
  Rules Emulator session was **not run**; this remains a P0 evidence gap.
- No Playwright/browser role journey was run because no isolated Firebase target
  was available. Static/unit accessibility tests are not browser evidence.
- No provider sandbox credential was available, so Stripe, Connect, DocuSign,
  email, SSO and accounting integrations are not `SANDBOX VERIFIED`.

## Explicitly not verified

- No production/preview signup, OTP, seed/reset, import/export, restore,
  migration, deletion, payment, refund or tenant data mutation ran.
- No secret value was read, printed, stored or committed.
- Live Firebase rules/index state, Storage billing, Stripe products/prices,
  Stripe/Connect webhooks/capabilities, monitoring alerts, backup/restore RPO/RTO,
  provider sandboxes, legal approval and the full role/browser matrix remain
  unverified.
