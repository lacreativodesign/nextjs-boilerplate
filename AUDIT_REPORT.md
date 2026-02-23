# CTA Audit Report

## ✅ Working
- `/users`: Add User CTA routes to `/users/add`, row click opens user drawer, live table search/filter, delete uses `/api/admin/users/delete`, reset MFA uses `/api/admin/users/[uid]/mfa`, and edit routes to `/users/[id]/edit`.
- `/admin/projects`: row click opens detail drawer, stage updates call update API, and search/filter updates list live.
- `/super_admin/system-health`: health data loads from `/api/super_admin/system-health`.
- `/super_admin/audit`: audit logs load from `/api/super_admin/audit`.

## ❌ Fixed
- `app/admin/clients/page.tsx`
  - Activation CTA changed from `/api/admin/clients/send-invite` to `/api/admin/clients/activation`.
  - Edit CTA route corrected from `/admin/clients/[id]/edit` to `/clients/[id]/edit`.
- `app/sales/leads/page.tsx`
  - Reworked leads list/actions to use admin sales APIs.
  - Add Lead now routes to `/sales/leads/add`.
  - Edit CTA routes to `/sales/leads/[id]/edit`.
  - Delete CTA now calls `/api/admin/sales/leads/delete` (POST `{ id }`).
  - Stage dropdown now updates via `/api/admin/sales/leads/update`.
- `app/sales/deals/page.tsx`
  - Deals list/update moved to `/api/admin/sales/deals/list` and `/api/admin/sales/deals/update`.
  - Added delete CTA using `/api/admin/sales/deals/delete`.
  - Close Won/Lost now updates stage/status via update API.
- `app/sales/follow-ups/page.tsx`
  - Follow-up list/create/update endpoints switched to `/api/admin/sales/follow-ups/*`.
  - Added delete CTA using `/api/admin/sales/follow-ups/delete`.
  - Fixed loading state type mismatch for save/update/delete actions.
- `app/finance/invoices/page.tsx`
  - Invoice list switched to `/api/admin/finance/invoices/list`.
  - Added `Create Invoice` CTA routing to `/admin/finance/invoices/create`.
  - Mark-as-paid now uses `/api/finance/invoices/mark-paid`.
  - Added delete CTA using `/api/admin/finance/invoices/delete`.
  - Download PDF enabled via `/api/admin/finance/invoices/[id]/pdf`.
- `app/finance/payments/page.tsx`
  - Payment list/update switched to `/api/admin/finance/payments/list` and `/api/admin/finance/payments/update`.
- `app/finance/payroll/page.tsx`
  - Payroll list/update/run switched to `/api/admin/finance/payroll/list`, `/api/admin/finance/payroll/update`, `/api/admin/finance/payroll/run`.
- `app/hr/employees/page.tsx`
  - Employee update endpoint switched to `/api/admin/hr/employees/update`.

## ⚠️ Needs Manual Testing
- `/super_admin/tenants`: endpoint path is `/api/super_admin/tenants` in code; confirm parity with deployment route expectations.
- `/super_admin/users`: verify edit/suspend semantics against `/api/super_admin/users/[uid]` with real super-admin credentials.
- `/hr/leave` (LeaveManagementDashboard): approval/rejection/request flows are encapsulated in component-level logic and need tenant role/data validation in live environment.
- `/hr/performance`: Add Review CTA/API wiring requires functional validation in environment with seeded HR review data.
- `/finance/invoices`: `Create Invoice` route availability should be validated in deployed routing tree.
