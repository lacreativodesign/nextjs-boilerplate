# Notifications & Audit Logging

This document outlines the core Firestore collections and helper APIs for Bizosto's in-app notifications and audit logging. These models are designed to be production-safe and extensible for future delivery channels (email, SMS, webhooks).

## Firestore Schemas

### `notifications` (in-app delivery)

**Document fields**
- `id` (string): Document ID.
- `tenantId` (string | null): Tenant scope for delivery, used to filter in-app notifications.
- `recipientUid` (string): User ID that receives the notification.
- `recipientRole` (string): Role captured at send time.
- `roleTarget` (string): Intended role audience when sent.
- `type` (string): `system`, `info`, `warning`, `success`, etc.
- `title` (string)
- `message` (string): Canonical message body.
- `body` (string): Legacy body content (kept for compatibility).
- `entityType` (string | null): e.g. `subscription`, `tenant`, `project`.
- `entityId` (string | null)
- `deepLink` (string | null): Client route for quick access.
- `priority` (`low` | `normal` | `high`)
- `metadata` (map | null): Flexible extension payload for downstream processors.
- `createdBy` (map | null): `{ uid, name }` when applicable.
- `isRead` (boolean)
- `read` (boolean): Legacy compatibility flag.
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### `auditLogs` (legacy critical actions)

**Document fields**
- `id` (string): Document ID.
- `tenantId` (string | null): Tenant scope (null for platform-level).
- `actorUserId` (string | null)
- `actorName` (string | null)
- `actorRole` (string | null)
- `actionType` (string): e.g. `subscription_status_changed`, `tenant_plan_updated`.
- `entityType` (string)
- `entityId` (string)
- `metadata` (map): Flexible metadata payload.
- `createdAt` (timestamp)

### `audit_logs` (compliance-grade audit trail)

**Document fields**
- `id` (string): Document ID.
- `tenantId` (string): Tenant scope.
- `userId` (string)
- `userEmail` (string)
- `userName` (string)
- `action` (string): `create`, `update`, `delete`, `login`, etc.
- `resource` (string): `user`, `invoice`, `payment`, etc.
- `resourceId` (string | null)
- `changes` (array | null): Field-level `{ field, oldValue, newValue }`.
- `metadata` (map): `{ ip, userAgent, location, sessionId }`.
- `status` (`success` | `failure`)
- `errorMessage` (string | null)
- `timestamp` (timestamp)
- `createdAt` (timestamp)

**Composite indexes**
- `tenantId` + `timestamp` (desc)
- `tenantId` + `userId` + `timestamp` (desc)
- `tenantId` + `resource` + `timestamp` (desc)
- `tenantId` + `action` + `timestamp` (desc)
- `tenantId` + `status` + `timestamp` (desc)

### `events` (tenant activity feed)

Used for tenant activity pages (non-critical timeline events). This is distinct from `auditLogs`.

## Helper APIs

### Notifications
- `createNotifications` (server): Fan-out to explicit recipients.
- `createRoleNotifications` (server): Fan-out to all users in a role (optionally across tenants) while preserving a target tenant scope.

### Audit Logs
- `writeAuditLog` (server): Appends to `auditLogs` for critical, traceable actions.

## Extension Points

- **Email/SMS**: A background job can watch `notifications` by `priority` and `metadata` to add external delivery.
- **Retention**: Add a scheduled cleanup on `auditLogs` based on an organizational retention policy.
- **Indexing**: Add composite indexes for `tenantId` + `createdAt` in both `notifications` and `auditLogs` for scale.
