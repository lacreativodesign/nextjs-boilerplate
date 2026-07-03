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

## SSO collections

- `tenants/{tenantId}/ssoConnections/{provider}`
  - `provider` ("google" | "microsoft" | "okta" | "auth0")
  - `enabled` (boolean)
  - `clientId` (string)
  - `clientSecret` (string, stored from environment-backed admin input)
  - `tenantHint` (string | null)
  - `allowedDomains` (string[])
  - `autoProvision` (boolean)
  - `updatedAt` (timestamp)
  - `updatedBy` (uid)
- `userSsoMappings/{tenantId_provider_providerUserId}`
  - `tenantId` (string)
  - `uid` (string)
  - `provider` (string)
  - `providerUserId` (string)
  - `email` (string)
  - `lastLoginAt` (timestamp)
  - `updatedAt` (timestamp)
- `tenants/{tenantId}/ssoAuditLogs/{logId}`
  - `event` (string)
  - `provider` (string)
  - `status` ("success" | "failure")
  - `actorUid` (string | null)
  - `subjectUid` (string | null)
  - `metadata` (map)
  - `createdAt` (timestamp)
- `ssoOAuthStates/{state}`
  - short-lived OAuth PKCE state with `tenantId`, `provider`, `nonce`, `codeVerifier`, `mode`, `expiresAt`, `consumedAt`
