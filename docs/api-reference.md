# Bizosto API Reference

## Overview
Bizosto provides a role-scoped REST API. Endpoints require authenticated session cookies unless explicitly public.

## Authentication
All authenticated API requests must include the session cookie created at login. Role-based access is enforced per endpoint; unauthorized role access returns `403`.

## Base URL
All endpoints are relative to your Bizosto deployment URL.

## Role-Scoped Endpoints

| Namespace | Roles | Description |
|-----------|-------|-------------|
| `/api/super_admin/*` | `super_admin` | Platform management and tenant control |
| `/api/admin/*` | `admin`, `super_admin` | Workspace admin operations and user management |
| `/api/sales_manager/*` | `sales_manager` | Sales team oversight and target management |
| `/api/sales/*` | `sales` | Lead and deal execution |
| `/api/am_manager/*` | `am_manager` | Account management oversight |
| `/api/am/*` | `am` | Client account execution workflows |
| `/api/production_manager/*` | `production_manager` | Production operations oversight |
| `/api/finance/*` | `finance`, `admin` | Invoices, expenses, and tax operations |
| `/api/hr/*` | `hr`, `admin` | Employee and HR operations |
| `/api/client/*` | `client` | Client portal data access |
| `/api/billing/*` | `admin` | Subscription and tenant billing |
| `/api/public/*` | none | Public endpoints (for example invoice payment flow) |
| `/api/cron/*` | system | Scheduled automation jobs |

## Key Public Endpoints

### `GET /api/public/invoice/[invoiceId]`
Returns invoice data for payment pages. No authentication required.

### `POST /api/public/invoice/[invoiceId]/pay`
Processes invoice payment. No authentication required.

Request body:

```json
{ "paymentMethodId": "string", "email": "optional-string" }
```

## Stripe Webhooks

| Endpoint | Purpose |
|----------|---------|
| `/api/stripe/webhook` | Invoice payment event handling |
| `/api/stripe/subscription-webhook` | Subscription lifecycle handling |
| `/api/stripe/connect/webhook` | Stripe Connect account event handling |

## Rate Limiting
API routes are rate-limited per tenant. Limits vary by endpoint category.

## Error Response Format
All API errors follow:

```json
{ "ok": false, "error": "string", "code": "optional-string", "status": 400 }
```

## Full API Documentation
Interactive API docs are available at `/api-docs`.
