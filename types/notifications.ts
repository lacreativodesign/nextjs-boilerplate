import type { Timestamp } from 'firebase-admin/firestore';

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'action_required'
  | 'reminder';

export type NotificationCategory =
  | 'system'
  | 'financial'
  | 'sales'
  | 'operations'
  | 'security'
  | 'team'
  | 'custom';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'webhook';

export type UserNotificationEventType =
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_completed'
  | 'project_status_changed'
  | 'project_milestone_reached'
  | 'approval_pending'
  | 'approval_approved'
  | 'approval_rejected'
  | 'leave_request_submitted'
  | 'leave_request_approved'
  | 'system_maintenance'
  | 'system_updates';

export type NotificationFrequency = 'instant' | 'hourly' | 'daily' | 'weekly';

export type NotificationDeliveryStatus = {
  inApp: 'pending' | 'delivered' | 'failed';
  email?: 'pending' | 'sent' | 'delivered' | 'failed';
  sms?: 'pending' | 'sent' | 'delivered' | 'failed';
  webhook?: 'pending' | 'sent' | 'delivered' | 'failed';
};

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: NotificationCategory;
  relatedResourceType?: string;
  relatedResourceId?: string;
  isRead: boolean;
  readAt?: Timestamp;
  isArchived: boolean;
  archivedAt?: Timestamp;
  channels: NotificationChannel[];
  deliveryStatus: NotificationDeliveryStatus;
  metadata?: Record<string, any>;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

export interface NotificationPreferences {
  id: string;
  tenantId: string;
  userId: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
  };
  categorySettings: {
    [category in NotificationCategory]: {
      enabled: boolean;
      channels: NotificationChannel[];
      minPriority?: 'low' | 'medium' | 'high' | 'urgent';
    };
  };
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  emailDigest?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    time: string;
  };
  updatedAt: Timestamp;
}

export type NotificationEventPreference = {
  enabled: boolean;
  channels: Array<Exclude<NotificationChannel, 'webhook'> | 'push'>;
  frequency: NotificationFrequency;
};

export type UserNotificationPreferences = {
  id: string;
  tenantId: string;
  userId: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  eventPreferences: Record<UserNotificationEventType, NotificationEventPreference>;
  digest: {
    enabled: boolean;
    frequencies: Array<'daily' | 'weekly'>;
    dailySendTime: string;
    weeklySendDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    weeklySendTime: string;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  unsubscribedEventTypes: UserNotificationEventType[];
  updatedAt: Timestamp;
  createdAt: Timestamp;
};

export type NotificationDigestItem = {
  id: string;
  tenantId: string;
  userId: string;
  eventType: UserNotificationEventType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  channels: Array<Exclude<NotificationChannel, 'webhook'> | 'push'>;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
  scheduledFor: Timestamp;
  frequency: Extract<NotificationFrequency, 'daily' | 'weekly' | 'hourly'>;
};

export interface NotificationTemplate {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  category: NotificationCategory;
  templates: {
    inApp: {
      title: string;
      message: string;
      actionLabel?: string;
    };
    email?: {
      subject: string;
      htmlBody: string;
      textBody: string;
    };
    sms?: {
      message: string;
    };
  };
  defaultPriority: 'low' | 'medium' | 'high' | 'urgent';
  defaultChannels: NotificationChannel[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NotificationWebhook = {
  id: string;
  tenantId: string;
  url: string;
  secret?: string;
  enabled: boolean;
  eventTypes?: NotificationType[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
