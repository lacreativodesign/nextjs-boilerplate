# Subprocessor register

**Owner:** LA CREATIVO GROUP, LLC (Texas) trading as Bizosto
**Last reviewed:** September 2026
**Review cadence:** quarterly, and before any new integration ships

A subprocessor is any third party that processes customer data on our behalf. SOC 2
(CC9.2) and GDPR Art. 28 both require this register to exist, to be accurate, and to be
disclosable to customers. `__tests__/config/compliance-docs.test.ts` asserts that every
name below still corresponds to something the code actually calls, so the register fails
CI rather than going quietly stale.

## Active subprocessors

These receive customer data in normal operation today.

| Subprocessor          | Purpose                                            | Data received                                                                                                                                                      | Endpoint                                                                    |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Vercel**            | Application hosting, edge network, cron scheduling | All request and response data in transit; request logs                                                                                                             | platform                                                                    |
| **Google (Firebase)** | Authentication, Firestore database, Cloud Storage  | All customer data at rest: accounts, CRM records, projects, finance records, uploaded documents                                                                    | `identitytoolkit.googleapis.com`, `firebasestorage.googleapis.com`          |
| **Stripe**            | Subscription billing and Stripe Connect payouts    | Billing contact details, subscription state, payment metadata. Card numbers are captured by Stripe directly and never reach Bizosto                                | `api.stripe.com`, `js.stripe.com`, `hooks.stripe.com`, `connect.stripe.com` |
| **Resend**            | Transactional email delivery                       | Recipient email address, sender identity, message body                                                                                                             | `api.resend.com`                                                            |
| **Upstash**           | Redis cache and rate limiting                      | IP addresses and user identifiers used as rate-limit keys; short-lived cache entries                                                                               | `api.upstash.com`                                                           |
| **Sentry**            | Error monitoring                                   | Stack traces, Firebase uid, tenant id and role tags. Email is **not** sent; cookies, headers and request bodies are stripped in `beforeSend` on all three runtimes | Sentry ingest                                                               |
| **Anthropic**         | AI Workforce agents                                | Only for tenants that have supplied their own API key (BYOK). The tenant's own operational records are included in agent prompts                                   | `api.anthropic.com`                                                         |
| **ExchangeRate-API**  | Currency conversion rates                          | No customer data. Currency codes only                                                                                                                              | `api.exchangerate-api.com`                                                  |
| **api.qrserver.com**  | Referral QR code rendering on the billing page     | The tenant's referral URL, which embeds their `BIZ-XXXXXX` referral code                                                                                           | `api.qrserver.com`                                                          |

### Notes on two of these

**Anthropic is conditional.** The AI Workforce is BYOK-only with no platform fallback. A
tenant that has never entered a key sends nothing to Anthropic. Any tenant that does enable
it should be told, in their own privacy notice, that their records are processed by
Anthropic — because from their customers' perspective, we are the processor and Anthropic
is the sub-processor.

**api.qrserver.com is the weakest link here.** It is a free public service with no
contract, no DPA and no stated retention policy, and the billing page hands it a URL
containing a tenant identifier. It is listed because it genuinely receives data, not
because it is defensible. Rendering the QR code client-side would remove this entry
entirely and is the recommended fix.

## Deferred integrations — code present, no credentials issued

Each of these has code in the repository and would become a subprocessor the moment
credentials are configured. None is currently reachable: the relevant environment
variables are unset and every one of these paths fails closed.

| Integration          | Would receive                             | Status                                                      |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Twilio               | SMS recipient numbers and message bodies  | No `TWILIO_AUTH_TOKEN`; signature verification fails closed |
| DocuSign             | Signer names, emails, document contents   | No `DOCUSIGN_WEBHOOK_SECRET`; fails closed as of SOC2 F-22  |
| Calendly             | Invitee names, emails, meeting times      | No OAuth client configured                                  |
| Xero                 | Invoices, contacts, ledger entries        | No OAuth client configured                                  |
| QuickBooks           | Invoices, contacts, ledger entries        | No OAuth client configured                                  |
| SendGrid             | Email recipients and bodies               | Fallback provider only; Resend is primary                   |
| Google OAuth / Gmail | Mailbox contents where connected          | No OAuth client configured                                  |
| Microsoft Graph      | Mailbox and calendar data where connected | No OAuth client configured                                  |
| Zapier               | Whatever a tenant maps into a Zap         | No webhook URL configured                                   |

**Before enabling any of these, add it to the Active table above and execute a DPA.**
Turning on an environment variable is what converts a row from the second table to the
first; nothing else in the system marks that moment.

## Dead code that is not a subprocessor

`@uploadcare/react-uploader` is a dependency and `components/FileUploader.tsx` imports it,
but that component is not mounted anywhere. The document uploader actually in use is
`components/files/FileUploader.tsx`, which writes to Firebase Cloud Storage.
`NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY` has zero readers in the codebase. **Uploadcare receives
no data and is not a subprocessor.** The dependency, the component and the environment
variable should all be removed so the register cannot be misread.

Google Fonts is likewise not a subprocessor: `next/font/google` self-hosts the Inter
webfont at build time, so no visitor request ever reaches `fonts.gstatic.com`.

## Outstanding obligations

None of the following exists yet. Each is required for a SOC 2 or GDPR review and none can
be produced from the codebase:

- Signed DPAs with Vercel, Google, Stripe, Resend, Upstash, Sentry and Anthropic
- Standard Contractual Clauses where data leaves the EEA
- Customer-facing subprocessor list published on the website, with advance notice of changes
- A documented review of each subprocessor's own SOC 2 report
