# Demo Environment

## Overview

Bizosto includes a pre-configured demo tenant for sales demonstrations and for the
Golden Tenant E2E certification suite.

Tenant ID: bizosto-demo

## Credentials

Demo account passwords are **not stored in this repository**. All ten demo accounts
share one password that is supplied to the seeder through the `E2E_DEMO_PASSWORD`
environment variable and is never printed, rendered in the Super Admin UI, or
committed. See `docs/runbooks/golden-tenant-e2e.md` for how it is configured in the
deployed environment and in GitHub Actions.

Re-running the seeder rotates every demo account to the currently configured value,
so rotating the secret is a configuration change followed by a reset.

## Demo Users

| Role               | Email                               |
| ------------------ | ----------------------------------- |
| Admin              | demo_admin@bizosto.com              |
| Sales              | demo_sales@bizosto.com              |
| Sales Manager      | demo_sales_manager@bizosto.com      |
| Account Manager    | demo_am@bizosto.com                 |
| AM Manager         | demo_am_manager@bizosto.com         |
| Production         | demo_production@bizosto.com         |
| Production Manager | demo_production_manager@bizosto.com |
| Finance            | demo_finance@bizosto.com            |
| HR                 | demo_hr@bizosto.com                 |
| Client             | demo_client@bizosto.com             |

The roster is defined once in `lib/demo/users.ts` and shared by the seeder and the
Super Admin demo page.

## Seeded Data

The fixture is deterministic: every document has a fixed ID, so re-seeding replaces
records rather than accumulating duplicates.

- 5 clients (the TechVision client is linked to the `demo_client` portal account)
- 5 leads across the early pipeline stages
- 1 deal, carrying the golden revenue journey
- 3 projects
- 4 invoices (paid and overdue)
- 3 production jobs
- 4 employees
- 4 notifications

## Running the Seed Script

Initial setup: npm run seed:demo
Full reset: npm run seed:demo:reset

`E2E_DEMO_PASSWORD` must be set in the environment; the seeder fails closed without it.

## Resetting via UI

Log in as super_admin → Super Admin → Demo Environment → Reset Demo Environment

## Important Notes

- Never use the demo tenant for real business data
- Reset before every important sales demo
- Reset is tenant-scoped: it deletes only documents whose `tenantId` is `bizosto-demo`
- Demo passwords live in configuration only — never in source, logs, or the UI
