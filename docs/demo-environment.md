# Demo Environment

## Overview

Bizosto includes a pre-configured demo tenant for sales demonstrations.
Tenant ID: bizosto-demo

## Demo Users

| Role               | Email                               | Password         |
| ------------------ | ----------------------------------- | ---------------- |
| Admin              | demo_admin@bizosto.com              | BizostoDemo2026! |
| Sales              | demo_sales@bizosto.com              | BizostoDemo2026! |
| Sales Manager      | demo_sales_manager@bizosto.com      | BizostoDemo2026! |
| Account Manager    | demo_am@bizosto.com                 | BizostoDemo2026! |
| AM Manager         | demo_am_manager@bizosto.com         | BizostoDemo2026! |
| Production         | demo_production@bizosto.com         | BizostoDemo2026! |
| Production Manager | demo_production_manager@bizosto.com | BizostoDemo2026! |
| Finance            | demo_finance@bizosto.com            | BizostoDemo2026! |
| HR                 | demo_hr@bizosto.com                 | BizostoDemo2026! |
| Client             | demo_client@bizosto.com             | BizostoDemo2026! |

## Seeded Data

- 10 demo clients across various industries
- 15 leads across all pipeline stages
- 12 invoices (draft, sent, paid, overdue)
- 8 projects in various statuses
- 10 production jobs
- 8 HR employee records
- Performance targets for key roles
- 5 notifications

## Running the Seed Script

Initial setup: npm run seed:demo
Full reset: npm run seed:demo:reset

## Resetting via UI

Log in as super_admin → Super Admin → Demo Environment → Reset Demo Environment

## Important Notes

- Never use demo tenant for real business data
- Reset before every important sales demo
- Demo user passwords are fixed: BizostoDemo2026!
- All demo data is isolated to tenantId: bizosto-demo
