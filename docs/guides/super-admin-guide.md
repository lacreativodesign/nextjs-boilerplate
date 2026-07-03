# Bizosto Super Admin Guide

## Overview

The `super_admin` role has full platform-wide access across all tenants in Bizosto. This is the only role that can access routes under `/super_admin`.

## Accessing the Super Admin Panel

- URL: `/super_admin`
- Log in with super admin credentials
- All super admin tools are available from the main super admin dashboard

## Tenant Management

### Creating a New Tenant

- Tenants are created automatically when a business signs up at `/signup`
- Manual tenant creation: `/super_admin/tenants` → **New Tenant**
- Required fields: company name, email, and plan
- After creation: configure module toggles and role toggles for the tenant

### Managing Existing Tenants

- View all tenants at `/super_admin/tenants`
- Select any tenant to open `/super_admin/tenants/[tenantId]`
- Tenant detail sections include:
  - Branding
  - Module Toggles
  - Role Toggles
  - Plan Settings
  - Stripe Connect Status

### Module Toggles

15 workspace modules are configurable per tenant:

- Dashboard
- Clients
- Sales
- Finance
- HR
- Production
- Projects
- Reports
- Notifications
- Admin
- CRM
- Inventory
- Approvals
- Billing
- Support

Operational notes:

- Toggle modules on or off per tenant with immediate effect
- Disabled modules route users to `/module-disabled`
- Core modules (Dashboard and Admin) should remain enabled for all tenants

### Role Toggles

- 10 tenant roles are configurable per tenant
- `super_admin` is always enabled and cannot be toggled
- Disabling a role blocks assigning that role to new users
- Existing users who already have a disabled role keep their access until manually reassigned

### Suspending a Tenant

- Set tenant status to `suspended` from the tenant detail page
- Suspended tenant users are redirected to `/suspended` on login
- Tenant data remains preserved during suspension

## Subscription & Billing Management

### Payment Terminal

- URL: `/super_admin/payments`
- Provides platform billing KPIs:
  - MRR
  - Active subscriptions
  - Failed payments
  - Tax collected
  - Platform fee revenue
- Includes transaction history and CSV export
- Includes failed payments panel for follow-up actions

### Plan Management

- Plan can be changed from the tenant detail page
- Available plans:
  - Starter ($99/mo)
  - Pro ($299/mo)
  - Enterprise ($799/mo)
- Plan changes apply on the next billing cycle

### Trial Management

- New tenants begin with a 14-day trial automatically
- Trial state is visible on tenant detail and payment terminal views
- Automated trial email schedule: day 7, day 3, day 1, day 0, and grace-period follow-up (+3 from grace window end process)

## System Health

### Full Health Check

- URL: `/super_admin/system-health/full`
- Checks include:
  - Firebase Admin
  - Firebase Auth
  - Firestore collections
  - Environment variables
  - Stripe connectivity
  - Resend connectivity
- Run before major deployments or incident investigations
- Use **Re-run** for on-demand checks

### Error Monitoring

- URL: `/super_admin/monitoring`
- Shows Sentry integration status and configuration
- Includes test actions to validate error ingestion
- Includes direct link to Sentry dashboard for live incidents

## Demo Environment

### Using the Demo

- URL: `/super_admin/demo`
- 10 demo accounts are preconfigured across tenant roles
- Seeded sample data spans core modules
- Use for demos only — never use LA CREATIVO live production data

### Resetting Demo Data

- Use **Reset Demo Environment** on the demo page
- Type `RESET` to confirm
- Demo tenant data is wiped and re-seeded
- Demo user accounts remain intact

## Audit Logs

- URL: `/super_admin/audit`
- Platform actions are logged with timestamp, actor, and details
- Filter by tenant, action type, and date range
- Export available for compliance and audit workflows

## User Management

- URL: `/super_admin/users`
- View users across all tenants
- Search by name or email
- Inspect user role, tenant, and last activity
