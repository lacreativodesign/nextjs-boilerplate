import type { Timestamp } from 'firebase-admin/firestore';

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'password_changed'
  | 'export'
  | 'import'
  | 'bulk_update'
  | 'bulk_delete'
  | 'role_changed'
  | 'permission_changed'
  | 'settings_changed';

export type AuditResource =
  | 'user'
  | 'tenant'
  | 'role'
  | 'permission'
  | 'invoice'
  | 'customer'
  | 'product'
  | 'order'
  | 'payment'
  | 'expense'
  | 'report'
  | 'settings'
  | 'integration'
  | 'project'
  | 'deal'
  | 'lead'
  | 'payroll'
  | 'change_request'
  | 'approval'
  | 'file'
  | 'event'
  | 'notification'
  | 'email'
  | 'attendance'
  // Billing lifecycle. Plan changes, cancellations and portal grants move money and
  // entitlement, and had no resource of their own — they were previously invisible to
  // any auditor filtering the trail by what was affected.
  | 'subscription';

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  changes?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  metadata: {
    ip?: string;
    userAgent?: string;
    location?: string;
    sessionId?: string;
  };
  status: 'success' | 'failure';
  errorMessage?: string;
  timestamp: Timestamp;
  createdAt: Timestamp;
}
