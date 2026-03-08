# Bizosto Tenant Admin Guide

## Your Role as Admin
- Full access to your tenant workspace
- Responsible for users, modules, billing, and workspace settings
- No access to other tenants or platform-level super admin controls

## Getting Started — Onboarding Checklist
1. Complete your company profile (**Settings → Profile**)
2. Invite your team (**Users → Invite**)
3. Add your first client (**Clients → New Client**)
4. Create your first invoice (**Finance → Invoices → New Invoice**)
5. Connect Stripe (**Settings → Payments**)
6. Configure tax rates if needed (**Finance → Tax**)
7. Set team performance targets on each role Performance page

## Managing Users

### Inviting Team Members
- Go to **Users → Invite User**
- Enter email, select role, and send invite
- User receives an email with login setup
- Only roles enabled for your workspace are selectable

### User Roles Available
- **Admin:** Full workspace access and management
- **Sales Manager:** Oversees sales team, pipeline, and targets
- **Sales:** Manages leads, deals, and client relationships
- **Account Manager Head (`am_manager`):** Oversees account managers and projects
- **Account Manager (`am`):** Manages client accounts and projects
- **Production Manager:** Oversees production jobs and team
- **Production:** Executes production jobs and task updates
- **Finance:** Manages invoices, expenses, tax, and financial reporting
- **HR:** Manages employees, onboarding, and HR operations
- **Client Portal (`client`):** Limited client-facing access for invoices and project visibility

### Deactivating Users
- Navigate to **Users** → open user → **Change Status → Inactive**
- Inactive users cannot log in
- Historical data remains preserved

## Billing & Subscription

### Your Subscription
- URL: `/billing`
- View plan, next billing date, and invoice history
- Upgrade or downgrade plan anytime
- Cancel anytime (access remains until current billing period ends)

### Adding a Payment Method
- Go to `/billing` and use **Choose Your Plan** (during trial)
- Enter card details using Stripe’s secure checkout form
- Payment method is stored for recurring monthly billing

### Payment Terminal (Accepting Payments from Clients)
- URL: `/billing/terminal`
- Requires Stripe connection in **Settings → Payments**
- Shows client payments, payouts, and revenue summaries
- Bizosto applies a 0.5% platform handling fee per transaction

## Connecting Stripe
- URL: `/settings/payments`
- Click **Connect Stripe Account** to start Stripe OAuth
- Authorize Bizosto to process payments on your behalf
- Tenant becomes merchant of record for client transactions
- Payment disputes are handled directly with Stripe

## Tax Configuration
- URL: `/finance/tax` (Finance module required)
- Add applicable tax rates (VAT, GST, Sales Tax, etc.)
- Set a default tax rate for new invoices
- Generate tax reports monthly, quarterly, or yearly
- Export CSV for tax filing workflows
- Tenant is responsible for jurisdiction-specific tax compliance

## Settings Overview
- **Profile:** Company name, logo, timezone, currency
- **Payments:** Stripe Connect setup and status
- **Notifications:** Alert and communication preferences
- **Security:** MFA and account protection settings
