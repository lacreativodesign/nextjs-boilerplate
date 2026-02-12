# Database Schema (Firestore)

## Tenant isolation
All collections storing tenant data include `tenantId` and are queried with tenant-scoped filters.

## Core collections
- `users`
  - `uid` (string)
  - `tenantId` (string)
  - `email` (string)
  - `role` (enum)
  - `status` (enum)
- `projects`
  - `id` (string)
  - `tenantId` (string)
  - `name` (string)
  - `ownerId` (string)
  - `status` (enum)
- `invoices`
  - `id` (string)
  - `tenantId` (string)
  - `customerId` (string)
  - `total` (number)
  - `currency` (string)
  - `status` (enum)
- `notifications`
  - `id` (string)
  - `tenantId` (string)
  - `userId` (string)
  - `read` (boolean)
  - `createdAt` (timestamp)

## Index strategy
Refer to `firestore.indexes.json` for explicit composite indexes required by analytics, reporting, and filtered searches.
