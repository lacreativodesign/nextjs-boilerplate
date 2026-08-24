# Bizosto product constitution

This document is the change-control authority for the launch-readiness branch.
Implementation must preserve it unless the owner explicitly approves a product
decision change.

## Product and audience

Bizosto is **the Operating System for Service Businesses**. The first release is
a controlled beta for three to five agencies, creative teams, or other service
businesses before broad self-service acquisition.

## Locked platform

- Next.js App Router
- Firebase Authentication
- Firestore
- Firebase / Google Cloud Storage
- Vercel
- GitHub

Do not replace this architecture to simplify a release audit.

## Locked roles and tenancy

The roles are `super_admin`, `admin`, `sales_manager`, `sales`, `am_manager`,
`am`, `production_manager`, `production`, `finance`, `hr`, and `client`.

Every business resource belongs to exactly one tenant. Tenant identity comes
from a verified session or from a server-owned resource already bound to that
session. Request bodies, query strings, webhook metadata, and object names are
never independent tenancy authority. Cross-tenant access is forbidden except
for explicit, audited Super Admin operations. Super Admin governs the platform;
tenant administrators govern only their permitted tenant operations.

## Locked commercial terms

| Plan       | Monthly | Annual | Internal users | Storage | Included scope                                                  |
| ---------- | ------: | -----: | -------------: | ------: | --------------------------------------------------------------- |
| Starter    |     $79 |   $790 |             10 |   20 GB | CRM, Sales, Projects, Client Portal                             |
| Pro        |    $149 | $1,490 |             20 |   75 GB | Starter + Finance, Production, AI Workforce BYOK, Website Embed |
| Enterprise |    $299 | $2,990 |      Unlimited |  250 GB | Pro + HR, Stripe Connect client payments, white-label           |

Annual billing equals two free months. The trial is 14 days, requires a payment
card, converts automatically on day 15, and does not charge when cancelled
before day 15. Starter allows 10 client-portal seats; Pro and Enterprise allow
unlimited client-portal seats. A Super Admin may grant temporary or permanent
module access above plan, and that override must be explicit and auditable.

Bizosto subscription billing and Enterprise tenant-client Stripe Connect
payments are distinct systems. The 0.5% platform transaction fee applies only
to eligible Enterprise Stripe Connect client payments, never to ordinary
Bizosto subscription charges.

## Locked business state machines

- Sales: New Lead → Contacted → Qualified → Proposal Sent → Negotiation →
  Closed Won / Closed Lost.
- Payment: Unpaid → Partially Paid → Paid / Refunded.
- Delivery: Not Started → In Progress → Blocked → Delivered.
- Discounts through 20% may be automatic; discounts above 20% require Sales
  Manager approval.
- Closed-won or paid activation creates the tenant-scoped client, project,
  notifications, and invite exactly once.
- Financial reporting follows paid transactions. Posted financial history is
  append-only; corrections use voids, refunds, credit notes, or adjustments.
- A tenant has one selected operating currency.

## Trust and integration rules

- Authentication, MFA, OTP, payment confirmation, signup confirmation, and
  client activation are request- or webhook-driven and never wait for the daily
  cron.
- AI provider keys are tenant-controlled BYOK where supported. Dangerous AI
  actions require explicit human approval and a durable post-approval action
  binding; an incomplete continuation must remain disabled and disclosed.
- Tenant sender identities and Reply-To behavior must preserve verified-domain
  ownership and deliverability.
- Stripe webhook signatures, connected-account binding, event idempotency, and
  server-owned invoice/subscription state are mandatory.
- Integration OAuth state is signed, tenant-bound, single-purpose, and expires.

## Hosting constraint

Exactly one Vercel cron entry may run once per day. It calls one authenticated
daily orchestrator with a central registry, per-job leases, idempotency,
failure isolation, bounded retries, execution logs, and an honest runtime
budget. Work that cannot be guaranteed in that budget is an owner decision,
not a fictional success. No external scheduler, paid queue, Firebase paid
service, or plan upgrade may be introduced without owner approval.

## Release truthfulness

Code, sandbox, owner action, and live deployment are separate evidence states:
`CODE READY`, `SANDBOX VERIFIED`, `OWNER PENDING`, `LIVE VERIFIED`, and
`BLOCKED`. A feature is never advertised as launch-ready solely because a file,
rule, index, environment-variable name, or mocked test exists.
